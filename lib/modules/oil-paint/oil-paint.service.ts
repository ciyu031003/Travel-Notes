/**
 * 油画生成服务：调用通义(阿里 DashScope) wanx2.1-imageedit + stylization_all，
 * 把一张真实照片「全局风格化」为油画版。
 *  - API key：从 AppSecret 表解密读取（不落代码/不经响应）。
 *  - 输入：把照片压缩到 ≤1536px 并以 Base64 传入（避免依赖公网可访问 URL）。
 *  - 异步任务制：提交 → 轮询 → 下载结果 → 存回我们的存储 → 缓存, 每张只生成一次。
 * 任何一步失败均返回 null, 由前端回退为原图, 不阻塞翻书。
 */
import { createHash } from 'crypto'
import { prisma } from '../../db'
import { getSecret } from '../secret/secret.service'
import { getStorageService } from '../../infrastructure/storage'
import sharp from 'sharp'

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/api/v1'
const MODEL = 'wanx2.1-imageedit'
const POLL_MAX = 40_000 // 最多等 40s
const POLL_INTERVAL = 3_000

function sourceKey(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

function serverOrigin(): string {
  const port = process.env.APP_PORT || '3000'
  return `http://127.0.0.1:${port}`
}

/**
 * 只允许解析为「本站同源」的 URL（SSRF 根治）。
 * WHATWG URL 会把 `/\evil.com`、`\\evil.com` 里的反斜杠归一为 `/`，
 * 简单的字符串前缀拦截可被绕过；这里解析后强校验 origin + 协议。
 */
function resolveImageUrl(url: string): string {
  const base = serverOrigin()
  const parsed = new URL(url, base)
  if (parsed.origin !== new URL(base).origin) throw new Error('blocked-non-local-url')
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('blocked-protocol')
  return parsed.toString()
}

async function fetchBuffer(url: string, timeoutMs = 20_000): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`获取图片失败: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function submitTask(apiKey: string, b64: string): Promise<string> {
  const res = await fetch(`${DASHSCOPE_BASE}/services/aigc/image2image/image-synthesis`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        function: 'stylization_all',
        prompt: '把这张照片转换成温暖温馨的油画风格，印象派笔触，柔和光线，保持画面构图与人物/景物真实感',
        base_image_url: b64,
      },
      parameters: { n: 1, strength: 0.6 },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.code) {
    throw new Error((data?.message || data?.code || `提交失败: ${res.status}`))
  }
  const taskId = data?.output?.task_id
  if (!taskId) throw new Error('未返回 task_id')
  return taskId
}

async function pollResult(apiKey: string, taskId: string): Promise<string | null> {
  const started = Date.now()
  while (Date.now() - started < POLL_MAX) {
    const res = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json().catch(() => ({}))
    const status = data?.output?.task_status
    if (status === 'SUCCEEDED') {
      return data?.output?.results?.[0]?.url || null
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(data?.output?.message || `任务${status}`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }
  return null
}

/** 同一张图并发请求合并为一次生成（避免重复计费） */
const IN_FLIGHT = new Map<string, Promise<string | null>>()

async function generateOilPainting(photoUrl: string, sk: string): Promise<string | null> {
  const apiKey = await getSecret('DASHSCOPE_API_KEY')
  if (!apiKey) return null // 未配置 key → 回退原图

  try {
    const bytes = await fetchBuffer(resolveImageUrl(photoUrl))
    const small = await sharp(bytes).resize({ width: 1536, height: 1536, fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()
    const b64 = `data:image/jpeg;base64,${small.toString('base64')}`

    const taskId = await submitTask(apiKey, b64)
    const resultUrl = await pollResult(apiKey, taskId)
    if (!resultUrl) return null

    const painted = await fetchBuffer(resultUrl)
    const storage = getStorageService()
    const key = `oil/${Date.now()}-${sk.slice(0, 12)}.png`
    const stored = await storage.upload(painted, key, 'image/png')
    const ourUrl = await storage.getUrl(key)

    await prisma.oilPainting.upsert({
      where: { sourceKey: sk },
      create: { sourceKey: sk, url: ourUrl },
      update: { url: ourUrl },
    }).catch((e) => {
      // 缓存写失败会导致下次同图重复计费，必须留痕
      console.error('[OilPaint] 缓存写入失败(同图可能重复计费):', (e as Error)?.message || e)
    })
    return ourUrl || stored.url
  } catch (err) {
    console.error('[OilPaint] 生成失败:', (err as Error)?.message || err)
    return null
  }
}

/** 生成（或取缓存）某张照片的油画版, 返回我们存储的 URL。失败返回 null。 */
export async function getOilPainting(photoUrl: string): Promise<string | null> {
  // 开关：未显式开启(OIL_PAINT_ENABLED !== 'true')则暂停使用通义 API, 不调用/不计费, 前端回退原图
  if (process.env.OIL_PAINT_ENABLED !== 'true') return null

  if (!photoUrl) return null
  const sk = sourceKey(photoUrl)

  const cached = await prisma.oilPainting.findUnique({ where: { sourceKey: sk } })
  if (cached) return cached.url

  const existing = IN_FLIGHT.get(sk)
  if (existing) return existing

  const task = generateOilPainting(photoUrl, sk).finally(() => {
    IN_FLIGHT.delete(sk)
  })
  IN_FLIGHT.set(sk, task)
  return task
}
