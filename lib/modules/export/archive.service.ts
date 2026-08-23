/**
 * v3.1 M2-E1：记忆档案导出。
 * 生成 ZIP：data.json（结构化元数据）+ travels.md / memories.md / moments.md（Markdown 叙事）
 *          + photos/（原图，按 storageKey 从本地/对象存储读取）。
 * 设计目标：导出包可再导入（data.json 含相对路径映射）。
 */
import archiver from 'archiver'
import { prisma } from '../../db'
import { scopedWhere } from '../../visibility'
import { memoryService } from '../memory/memory.service'

export interface ExportResult {
  /** 内存 ZIP buffer */
  buffer: Buffer
  filename: string
  stats: { travels: number; memories: number; moments: number; photos: number }
}

const md = (s: string | null | undefined) => (s ? String(s) : '')

/** 读取媒体文件字节（本地存储 or 对象存储） */
async function readMediaBytes(storageKey: string): Promise<Buffer | null> {
  try {
    if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
      const client = new S3Client({
        endpoint: process.env.STORAGE_ENDPOINT,
        region: process.env.STORAGE_REGION || 'auto',
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
          secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
        },
        forcePathStyle: true,
      })
      const res = await client.send(new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: storageKey }))
      const chunks: Uint8Array[] = []
      const stream = res.Body as any
      for await (const chunk of stream) chunks.push(chunk as Uint8Array)
      return Buffer.concat(chunks)
    }
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.join(process.env.UPLOAD_DIR || 'public/uploads', storageKey)
    return await fs.promises.readFile(filePath)
  } catch {
    return null
  }
}

/** 导出当前用户的全部记忆档案 */
export async function exportMemoryArchive(username: string): Promise<ExportResult> {
  const userId = (await prisma.user.findUnique({ where: { username }, select: { id: true } }))?.id

  // 1) 旅行（含天数）
  const travels = await prisma.travel.findMany({
    where: scopedWhere(userId, 'ownerId') as any,
    orderBy: { startDate: 'asc' },
    include: { days: { orderBy: { sortOrder: 'asc' } } },
  })

  // 2) 回忆（含照片）——查用户创建或所属空间的回忆
  const userSpaces = userId
    ? (await prisma.spaceMember.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { spaceId: true },
      })).map((s) => s.spaceId)
    : []
  const memories = await prisma.memory.findMany({
    where: {
      OR: [
        ...(userSpaces.length ? [{ spaceId: { in: userSpaces } }] : []),
        ...(userId ? [{ createdById: userId }] : []),
      ],
    } as any,
    include: {
      media: { include: { variants: { where: { variant: 'THUMBNAIL' } } } },
      mediaLinks: { include: { media: true } },
    },
  })

  // 3) 碎碎念
  const moments = await prisma.moment.findMany({
    where: scopedWhere(userId) as any,
    orderBy: { createdAt: 'asc' },
  })

  // 4) 相册
  const albums = await prisma.album.findMany({
    where: scopedWhere(userId) as any,
    orderBy: { createdAt: 'asc' },
  })

  const photoCache = new Map<string, Buffer>()
  const photoKeys = new Set<string>()
  const allMedia = memories.flatMap((m: any) => [
    ...(m.media || []),
    ...(m.mediaLinks || []).map((l: any) => l.media).filter(Boolean),
  ])
  for (const media of allMedia) {
    if (media?.storageKey && !photoKeys.has(media.storageKey)) {
      photoKeys.add(media.storageKey)
      const bytes = await readMediaBytes(media.storageKey)
      if (bytes) photoCache.set(media.storageKey, bytes)
    }
  }

  // === 生成 Markdown ===
  const travelsMd: string[] = ['# 旅行档案\n']
  for (const t of travels) {
    travelsMd.push(`## ${t.title}（${t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : '未定日期'}）`)
    travelsMd.push(`- 地点：${md(t.location)}`)
    travelsMd.push(`- 状态：${t.status}`)
    travelsMd.push(`- 描述：${md(t.description)}`)
    if (t.days?.length) {
      travelsMd.push(`\n### 天数（${t.days.length}）`)
      for (const d of t.days) {
        travelsMd.push(`- DAY: ${d.title || ''} ${d.date ? new Date(d.date).toISOString().slice(0, 10) : ''} — ${md(d.summary)}`)
      }
    }
    travelsMd.push('')
  }

  const memoriesMd: string[] = ['# 回忆档案\n']
  for (const m of memories) {
    const photos = [
      ...(m.media || []).map((x: any) => x.storageKey),
      ...(m.mediaLinks || []).map((l: any) => l.media?.storageKey).filter(Boolean),
    ]
    memoriesMd.push(`## ${m.title}`)
    memoriesMd.push(`- 时间：${m.happenedAt ? new Date(m.happenedAt).toISOString() : ''}`)
    memoriesMd.push(`- 心情：${md(m.mood)}`)
    memoriesMd.push(`- 内容：${md(m.content)}`)
    if (photos.length) memoriesMd.push(`- 照片：${photos.map((p: string) => `photos/${p.replace(/\//g, '_')}`).join(', ')}`)
    memoriesMd.push('')
  }

  const momentsMd: string[] = ['# 碎碎念档案\n']
  for (const m of moments) {
    momentsMd.push(`- ${m.createdAt ? new Date(m.createdAt).toISOString() : ''}：${m.content}`)
  }

  // === 结构化 JSON（含相对路径映射，可再导入） ===
  const dataJson = {
    exportedAt: new Date().toISOString(),
    app: 'Travel-Notes',
    version: '3.1-M2',
    travels: travels.map((t: any) => ({
      id: t.id,
      title: t.title,
      location: t.location,
      startDate: t.startDate,
      status: t.status,
      days: (t.days || []).map((d: any) => ({ title: d.title, date: d.date, summary: d.summary })),
    })),
    memories: memories.map((m: any) => ({
      id: m.id,
      title: m.title,
      content: m.content,
      mood: m.mood,
      happenedAt: m.happenedAt,
      photos: [
        ...(m.media || []).map((x: any) => `photos/${x.storageKey.replace(/\//g, '_')}`),
        ...(m.mediaLinks || []).map((l: any) => l.media ? `photos/${l.media.storageKey.replace(/\//g, '_')}` : null).filter(Boolean),
      ],
    })),
    moments: moments.map((m: any) => ({ id: m.id, content: m.content, createdAt: m.createdAt })),
    albums: albums.map((a: any) => ({ id: a.id, title: a.title, date: a.date })),
  }

  // === 打 ZIP ===
  const archive = archiver('zip', { zlib: { level: 9 } })
  const chunks: Buffer[] = []
  const stream = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (c) => chunks.push(c))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
  })

  archive.append(travelsMd.join('\n'), { name: 'travels.md' })
  archive.append(memoriesMd.join('\n'), { name: 'memories.md' })
  archive.append(momentsMd.join('\n'), { name: 'moments.md' })
  archive.append(JSON.stringify(dataJson, null, 2), { name: 'data.json' })

  for (const [storageKey, bytes] of Array.from(photoCache.entries())) {
    archive.append(bytes, { name: `photos/${storageKey.replace(/\//g, '_')}` })
  }
  await archive.finalize()
  const buffer = await stream

  return {
    buffer,
    filename: `travel-notes-archive-${username}-${new Date().toISOString().slice(0, 10)}.zip`,
    stats: { travels: travels.length, memories: memories.length, moments: moments.length, photos: photoCache.size },
  }
}

export { memoryService }
