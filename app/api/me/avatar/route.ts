import { NextRequest } from 'next/server'
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { getCurrentUserId } from '@/lib/current-user'
import { updateMyAvatar, getMyProfile } from '@/lib/modules/social/profile.service'
import { ok, unauthorized, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()

  try {
    const formData = await request.formData()
    const file = formData.get('avatar')
    if (!(file instanceof File)) return fail('请选择头像图片', 400)
    if (!file.type.startsWith('image/')) return fail('仅支持图片文件', 400)

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) return fail('图片为空', 400)
    if (buffer.length > MAX_AVATAR_BYTES) return fail('头像图片不能超过 5MB', 400)

    const dir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
    await mkdir(dir, { recursive: true })

    const output = await sharp(buffer)
      .rotate()
      .resize(256, 256, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer()

    const fileName = 'avatar-' + userId + '-' + Date.now() + '.webp'
    await writeFile(path.join(dir, fileName), output)
    const avatarUrl = '/uploads/avatars/' + fileName

    const previous = await getMyProfile(userId)
    if (previous?.avatarUrl && previous.avatarUrl.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(process.cwd(), 'public', previous.avatarUrl.slice(1))
      unlink(oldPath).catch(() => {})
    }

    const data = await updateMyAvatar(userId, avatarUrl)
    return ok(data)
  } catch (e: any) {
    console.error('[POST /api/me/avatar]', e?.message || e)
    return serverError()
  }
}
