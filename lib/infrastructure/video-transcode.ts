/**
 * 视频转码管线（背景队列）。
 *
 * - 触发：视频上传完成（单传 / 断点续传 complete）后对超过阈值的原始视频入队；
 *   另有 sweep 扫描历史「无变体且无新鲜标记」的视频补队（覆盖服务重启丢队列的场景）。
 * - 产物：`<name>-720.mp4`（H.264 720p + AAC + faststart），同目录、原文件保留。
 * - 状态：跑前写 `<name>.transcoding` 标记，完成后删除——文件系统即状态，
 *   无 DB 依赖；标记超过 1 小时视为上次进程崩溃残留，sweep 时重新入队。
 * - 降级：ffmpeg 不可用时一次性记日志并整体跳过（功能开关式降级，不影响上传主链路）。
 */
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { variantFilenameFor, TRANSCODE_MIN_SIZE } from './video-upload-shared'

const VIDEO_DIR = path.join(process.cwd(), 'public', 'uploads', 'videos')
const MARKER_SUFFIX = '.transcoding'
const STALE_MARKER_MS = 60 * 60 * 1000

let ffmpegChecked = false
let ffmpegAvailable = false
const queue: string[] = []
let running = false

export function isFfmpegAvailable(): boolean {
  if (ffmpegChecked) return ffmpegAvailable
  ffmpegChecked = true
  try {
    const probe = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
    probe.on('error', () => {
      ffmpegAvailable = false
      console.warn('[video-transcode] ffmpeg 不可用，转码功能降级跳过')
    })
    probe.on('exit', (code) => {
      ffmpegAvailable = code === 0
      if (!ffmpegAvailable) console.warn('[video-transcode] ffmpeg 不可用，转码功能降级跳过')
    })
    // 乐观假定可用；probe 失败会在执行 job 时兜底
    ffmpegAvailable = true
  } catch {
    ffmpegAvailable = false
  }
  return ffmpegAvailable
}

function runFfmpeg(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 720p 等比缩放（竖屏/横屏都安全）；veryfast 在 4C 上单任务约实时 2-4x
    const args = [
      '-y', '-i', src,
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      dst,
    ]
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderrTail = ''
    child.stderr?.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit ${code}: ${stderrTail.slice(-500)}`))
    })
  })
}

async function processQueue(): Promise<void> {
  if (running) return
  running = true
  while (queue.length > 0) {
    const filename = queue.shift() as string
    const src = path.join(VIDEO_DIR, filename)
    const variant = variantFilenameFor(filename)
    const dst = path.join(VIDEO_DIR, variant)
    const marker = src + MARKER_SUFFIX
    // COSFS（对象存储语义）不友好于 ffmpeg 的渐进写 + faststart 二次重写——
    // 先转码到容器本地盘，成功后整文件落到媒体目录。
    const tmpDst = path.join(os.tmpdir(), 'tn-transcode-' + variant)
    try {
      if (!fs.existsSync(src) || fs.existsSync(dst)) continue
      if (!isFfmpegAvailable()) continue
      fs.writeFileSync(marker, String(Date.now()))
      const t0 = Date.now()
      try { fs.unlinkSync(tmpDst) } catch {}
      await runFfmpeg(src, tmpDst)
      fs.copyFileSync(tmpDst, dst)
      const kb = Math.round(fs.statSync(dst).size / 1024)
      console.log(`[video-transcode] ${filename} -> ${variant} (${kb}KB, ${Date.now() - t0}ms)`)
    } catch (e) {
      console.error(`[video-transcode] ${filename} 转码失败:`, (e as Error).message)
      // 失败清半成品，避免留下坏变体
      try { if (fs.existsSync(dst)) fs.unlinkSync(dst) } catch {}
    } finally {
      try { if (fs.existsSync(tmpDst)) fs.unlinkSync(tmpDst) } catch {}
      try { if (fs.existsSync(marker)) fs.unlinkSync(marker) } catch {}
    }
  }
  running = false
}

/** 入队（幂等：同文件重复入队自动去重） */
export function enqueueTranscode(filename: string): void {
  if (queue.includes(filename)) return
  queue.push(filename)
  void processQueue()
}

export type TranscodeStatus = 'done' | 'pending' | 'queued' | 'skipped' | 'none'

/** 查询某视频的转码状态（供编辑器轮询，完成后把引用切到变体） */
export function getTranscodeStatus(filename: string): { status: TranscodeStatus; url?: string } {
  const variant = variantFilenameFor(filename)
  if (fs.existsSync(path.join(VIDEO_DIR, variant))) {
    return { status: 'done', url: `/uploads/videos/${variant}` }
  }
  if (fs.existsSync(path.join(VIDEO_DIR, filename + MARKER_SUFFIX))) return { status: 'pending' }
  if (queue.includes(filename)) return { status: 'queued' }
  const src = path.join(VIDEO_DIR, filename)
  if (fs.existsSync(src) && fs.statSync(src).size < TRANSCODE_MIN_SIZE) return { status: 'skipped' }
  return { status: 'none' }
}

/**
 * 扫描历史视频补队：无变体、无新鲜标记、超过阈值的原始视频重新入队。
 * 在上传入口调用（轻量 readdir，视频目录量级小）。标记过旧 = 上次崩溃残留。
 */
export function sweepAndEnqueue(): number {
  try {
    if (!fs.existsSync(VIDEO_DIR)) return 0
    let enqueued = 0
    for (const name of fs.readdirSync(VIDEO_DIR)) {
      if (name.endsWith(MARKER_SUFFIX) || name.includes('-720.')) continue
      const full = path.join(VIDEO_DIR, name)
      let stat: fs.Stats
      try { stat = fs.statSync(full) } catch { continue }
      if (!stat.isFile() || stat.size < TRANSCODE_MIN_SIZE) continue
      if (fs.existsSync(path.join(VIDEO_DIR, variantFilenameFor(name)))) continue
      const marker = full + MARKER_SUFFIX
      if (fs.existsSync(marker)) {
        const age = Date.now() - Number(fs.readFileSync(marker, 'utf8') || 0)
        if (Number.isFinite(age) && age < STALE_MARKER_MS) continue
      }
      enqueueTranscode(name)
      enqueued += 1
    }
    if (enqueued > 0) console.log(`[video-transcode] sweep 补队 ${enqueued} 个历史视频`)
    return enqueued
  } catch (e) {
    console.warn('[video-transcode] sweep 失败:', (e as Error).message)
    return 0
  }
}
