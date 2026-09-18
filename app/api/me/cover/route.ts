import { NextRequest } from 'next/server'
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { getCurrentUserId } from '@/lib/current-user'
import { getMyProfile, updateMyCover, updateMyCoverFocus } from '@/lib/modules/social/profile.service'
import { COVER_SIZES, coverFilePaths, coverObjectPosition } from '@/lib/modules/social/profile-cover'
import { ok, unauthorized, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

const MAX_COVER_BYTES = 12 * 1024 * 1024

/**
 * 档案头图（个人主页封面）上传。
 *
 * 设计要点（R1）：
 *  · 主图 1600×900 webp（首屏）+ 预览 400×225 webp（大屏/弱网）+ 16×9 blur（占位），
 *    与 `app/api/me/avatar/route.ts` 同构，消费端可逐级降级；
 *  · 焦点 `focusX/focusY`（0-1 归一化，可缺省）随图一起保存，渲染为 `object-position`——
 *    用户上传的横幅照直接居中会裁掉主体，让用户点一下九宫格决定「画面重点在哪」；
 *  · 旧头图三件套在上传成功后清理（失败不影响主流程）。
 *
 * 另外支持 `PUT`：**只改焦点、不重传图片**（用户对同一张图重选重点）。
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()

  try {
    const formData = await request.formData()
    const file = formData.get('cover')
    if (!(file instanceof File)) return fail('请选择头图图片', 400)
    if (!file.type.startsWith('image/')) return fail('仅支持图片文件', 400)

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) return fail('图片为空', 400)
    if (buffer.length > MAX_COVER_BYTES) return fail('头图不能超过 12MB', 400)

    const focus = parseFocus(formData.get('focusX'), formData.get('focusY'))
    if (focus === 'invalid') return fail('焦点参数不合法（应为 0-1 之间的数字）', 400)

    const dir = path.join(process.cwd(), 'public', 'uploads', 'covers')
    await mkdir(dir, { recursive: true })

    // fit:'cover' + position:'attention' 让 sharp 自己先挑一次主体，
    // 用户再用九宫格微调；两者叠加比单纯居中稳得多。
    const [main, preview, blur] = await Promise.all([
      sharp(buffer)
        .rotate()
        .resize(COVER_SIZES.main.width, COVER_SIZES.main.height, { fit: 'cover', position: 'attention' })
        .webp({ quality: 84 })
        .toBuffer(),
      sharp(buffer)
        .rotate()
        .resize(COVER_SIZES.preview.width, COVER_SIZES.preview.height, { fit: 'cover', position: 'attention' })
        .webp({ quality: 80 })
        .toBuffer(),
      sharp(buffer)
        .rotate()
        .resize(COVER_SIZES.blur.width, COVER_SIZES.blur.height, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 60 })
        .toBuffer(),
    ])

    const fileName = 'cover-' + userId + '-' + Date.now()
    await Promise.all([
      writeFile(path.join(dir, fileName + '.webp'), main),
      writeFile(path.join(dir, fileName + '-preview.webp'), preview),
      writeFile(path.join(dir, fileName + '-blur.jpg'), blur),
    ])
    const coverUrl = '/uploads/covers/' + fileName + '.webp'

    // 清理旧头图（只清我们自己的 covers 目录，别碰外部/对象存储 URL）
    const previous = await getMyProfile(userId)
    if (previous?.coverUrl && previous.coverUrl.includes('/uploads/covers/')) {
      coverFilePaths(previous.coverUrl).forEach((urlPath) => {
        const relFile = urlPath.replace(/^\//, '')
        unlink(path.join(process.cwd(), 'public', relFile)).catch(() => {})
      })
    }

    const data = await updateMyCover(userId, coverUrl, focus === 'none' ? undefined : focus)
    return ok({ ...data, objectPosition: coverObjectPosition(data.coverFocusX, data.coverFocusY) })
  } catch (e: unknown) {
    console.error('[POST /api/me/cover]', (e as Error)?.message || e)
    return serverError()
  }
}

/** 只更新焦点（不重传图片）。显式传 null 表示恢复居中 */
export async function PUT(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()

  try {
    const body = await request.json().catch(() => ({}))
    const rawX = body?.focusX
    const rawY = body?.focusY

    const focus = parseFocus(rawX, rawY)
    if (focus === 'invalid') return fail('焦点参数不合法（应为 0-1 之间的数字）', 400)

    const profile = await getMyProfile(userId)
    if (!profile?.coverUrl) return fail('还没有上传头图', 400)

    const next = focus === 'none' ? { x: null, y: null } : (focus as { x: number; y: number })
    const data = await updateMyCoverFocus(userId, next)
    return ok({ ...data, objectPosition: coverObjectPosition(data.coverFocusX, data.coverFocusY) })
  } catch (e: unknown) {
    console.error('[PUT /api/me/cover]', (e as Error)?.message || e)
    return serverError()
  }
}

type Focus = { x: number; y: number } | 'none' | 'invalid'

/**
 * 解析并校验焦点。
 *  · 两个都缺省 / 都是空 → 'none'（保持/恢复居中）
 *  · 只给一个 → 'invalid'（避免半套坐标落库，之后渲染必然错位）
 *  · 非数字或越界 → 'invalid'
 */
function parseFocus(rawX: unknown, rawY: unknown): Focus {
  const missing = (v: unknown) => v == null || v === ''
  if (missing(rawX) && missing(rawY)) return 'none'
  if (missing(rawX) !== missing(rawY)) return 'invalid'
  const x = Number(rawX)
  const y = Number(rawY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'invalid'
  if (x < 0 || x > 1 || y < 0 || y > 1) return 'invalid'
  return { x, y }
}
