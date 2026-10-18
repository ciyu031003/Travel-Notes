import { NextRequest } from 'next/server'
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { getCurrentUserId } from '@/lib/current-user'
import { updateMyAvatar, getMyProfile } from '@/lib/modules/social/profile.service'
import { avatarFilePaths } from '@/lib/modules/social/avatar-variants'
import { ok, unauthorized, serverError, ApiError, errorResponse } from '@/lib/api-response'
import { getRequestId } from '@/lib/api/handler'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/** 头像上传：multipart 表单，只校验文件形状/类型/大小（内容由 sharp 重编码） */
const AvatarFormSchema = z.object({
  avatar: z
    .custom<File>((v) => v instanceof File, { message: '请选择头像图片' })
    .refine((f) => f.type.startsWith('image/'), { message: '仅支持图片文件' })
    .refine((f) => f.size > 0, { message: '图片为空' })
    .refine((f) => f.size <= MAX_AVATAR_BYTES, { message: '头像图片不能超过 5MB' }),
})

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()

  try {
    // P1-17：multipart 不套 parseBody(JSON)，按字段形状做 zod 校验（类型/大小）
    const formData = await request.formData()
    const parsedForm = AvatarFormSchema.safeParse({ avatar: formData.get('avatar') })
    if (!parsedForm.success) {
      throw new ApiError('VALIDATION_ERROR', parsedForm.error.issues[0]?.message || '请选择头像图片', 400)
    }
    const file = parsedForm.data.avatar
    const buffer = Buffer.from(await file.arrayBuffer())

    const dir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
    await mkdir(dir, { recursive: true })

    // 主图 256×256（列表/评论），preview 1024×1024（个人主页高分屏），blur 16px（低质占位）
    const [main, preview, blur] = await Promise.all([
      sharp(buffer)
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer(),
      sharp(buffer)
        .rotate()
        .resize(1024, 1024, { fit: 'cover', position: 'attention' })
        .webp({ quality: 88 })
        .toBuffer(),
      sharp(buffer)
        .rotate()
        .resize(16, 16, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 60 })
        .toBuffer(),
    ])

    const fileName = 'avatar-' + userId + '-' + Date.now()
    await Promise.all([
      writeFile(path.join(dir, fileName + '.webp'), main),
      writeFile(path.join(dir, fileName + '-preview.webp'), preview),
      writeFile(path.join(dir, fileName + '-blur.jpg'), blur),
    ])
    const avatarUrl = '/uploads/avatars/' + fileName + '.webp'

    const previous = await getMyProfile(userId)
    if (previous?.avatarUrl && previous.avatarUrl.startsWith('/uploads/avatars/')) {
      avatarFilePaths(previous.avatarUrl).forEach((urlPath) => {
        // 去掉前导 / 再拼 public 目录（path.join 遇绝对路径会重置）
        const relFile = urlPath.replace(/^\//, '')
        unlink(path.join(process.cwd(), 'public', relFile)).catch(() => {})
      })
    }

    const data = await updateMyAvatar(userId, avatarUrl)
    return ok(data)
  } catch (e: any) {
    if (e instanceof ApiError) return errorResponse(e, getRequestId(request))
    console.error('[POST /api/me/avatar]', e?.message || e)
    return serverError()
  }
}
