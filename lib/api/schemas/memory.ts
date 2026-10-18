/**
 * Memory 域写路由 schema（P1-17 收尾 B）。
 * 标题/心情/可见性的业务规则仍由 memory.service 校验（不改变既有行为），这里只保证形状。
 */
import { z } from 'zod'
import { IdSchema, NullableDateStringSchema, NullableIdSchema } from './common'
import { VisibilitySchema } from './travel'

/** PATCH /api/memories/[id] */
export const UpdateMemorySchema = z.object({
  title: z.string().trim().min(1, '回忆标题需为 1-255 个字符').max(255, '回忆标题需为 1-255 个字符').optional(),
  content: z.string().max(50_000, '内容过长').nullable().optional(),
  happenedAt: NullableDateStringSchema.optional(),
  travelId: NullableIdSchema.optional(),
  travelDayId: NullableIdSchema.optional(),
  locationId: NullableIdSchema.optional(),
  mood: z.string().max(50, '心情标签过长').nullable().optional(),
  visibility: VisibilitySchema.optional(),
})

/** POST / DELETE /api/memories/[id]/media */
export const AttachMemoryMediaSchema = z.object({
  mediaIds: z.array(IdSchema, { message: '缺少 mediaIds' }).min(1, '缺少 mediaIds').max(50, '一次最多关联 50 张媒体'),
})
