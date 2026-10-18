/**
 * 社交域写路由 schema（P1-17 收尾 B）。
 */
import { z } from 'zod'
import { IdSchema } from './common'

/** POST /api/social/posts/[id]/report */
export const ReportPostSchema = z.object({
  reason: z
    .string({ message: '请填写举报原因' })
    .trim()
    .min(1, '请填写举报原因')
    .max(255, '举报原因过长'),
})

/** PATCH /api/social/notifications（body 可省略 = 全部标记已读） */
export const MarkNotificationsReadSchema = z.object({
  ids: z.array(IdSchema, { message: '通知 ID 不合法' }).max(500, '一次最多标记 500 条').optional(),
})

/** POST /api/photo-messages */
export const AddPhotoMessageSchema = z.object({
  image: z.string({ message: '缺少图片标识' }).trim().min(1, '缺少图片标识'),
  content: z
    .string({ message: '留言内容不能为空' })
    .trim()
    .min(1, '留言内容不能为空')
    .max(500, '留言过长（最多 500 字）'),
})
