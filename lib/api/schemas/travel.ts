/**
 * 旅行域写路由 schema（P1-17 收尾 B）。
 * 只做「形状 / 范围」校验；权限与业务规则（slug 唯一、预算范围、行程归属等）仍在 service 层，
 * 本批不改变任何既有权限或业务分支。
 */
import { z } from 'zod'
import { IdSchema, NullableDateStringSchema, NullableIdSchema } from './common'

export const TravelStatusSchema = z.enum(['PLANNED', 'ONGOING', 'COMPLETED'], {
  message: '旅行状态无效',
})
export const VisibilitySchema = z.enum(['PRIVATE', 'SPACE', 'PUBLIC'], { message: '可见性无效' })
export const TravelTypeSchema = z.enum(
  ['ALONE', 'COUPLE', 'FAMILY', 'FRIENDS', 'BFF', 'GROUP', 'OTHER'],
  { message: '旅行类型无效' },
)

/** POST /api/travels/[id]/days */
export const AddTravelDaySchema = z.object({
  date: NullableDateStringSchema.optional(),
  title: z.string().max(60, '标题过长（最多 60 字）').nullable().optional(),
  summary: z.string().max(500, '摘要过长（最多 500 字）').nullable().optional(),
})

/** POST /api/travels/[id]/expenses */
export const AddExpenseSchema = z.object({
  amount: z.coerce
    .number({ message: '请输入有效金额' })
    .finite('请输入有效金额')
    .positive('请输入有效金额')
    .max(100_000_000, '金额数值过大'),
  currency: z.string().trim().max(10, '币种无效').optional(),
  category: z.string().trim().max(50, '分类无效').optional(),
  payer: z.string().max(60, '付款人过长').nullable().optional(),
  note: z.string().max(200, '备注过长').nullable().optional(),
  happenedAt: NullableDateStringSchema.optional(),
  itineraryItemId: NullableIdSchema.optional(),
})

/** POST /api/travels/[id]/itinerary */
export const AddItineraryItemSchema = z.object({
  dayId: IdSchema,
  title: z
    .string({ message: '参数不完整：dayId / title 必填' })
    .trim()
    .min(1, '参数不完整：dayId / title 必填')
    .max(120, '名称过长（最多 120 字）'),
  startTime: z.string().max(40, '时间格式不正确').nullable().optional(),
  endTime: z.string().max(40, '时间格式不正确').nullable().optional(),
  type: z.string().max(50, '行程类型无效').optional(),
  notes: z.string().max(500, '备注过长（最多 500 字）').nullable().optional(),
})

/** PATCH /api/travels/[id]/itinerary/[itemId] */
export const UpdateItineraryItemSchema = z.object({
  title: z.string().trim().min(1, '行程名称不能为空').max(120, '名称过长（最多 120 字）').optional(),
  startTime: z.string().max(40, '时间格式不正确').nullable().optional(),
  endTime: z.string().max(40, '时间格式不正确').nullable().optional(),
  type: z.string().max(50, '行程类型无效').optional(),
  notes: z.string().max(500, '备注过长（最多 500 字）').nullable().optional(),
})

/** POST /api/travels/[id]/memories */
export const CreateTravelMemorySchema = z.object({
  title: z.string().trim().min(1, '回忆标题需为 1-255 个字符').max(255, '回忆标题需为 1-255 个字符'),
  content: z.string().max(50_000, '内容过长').nullable().optional(),
  mood: z.string().max(50, '心情标签过长').nullable().optional(),
  happenedAt: NullableDateStringSchema.optional(),
  travelDayId: NullableIdSchema.optional(),
  isPublic: z.boolean().optional(),
})

/** PATCH /api/travels/[id]/space：null / 空串都表示「收回成仅自己」 */
export const UpdateTravelSpaceSchema = z.object({
  spaceId: z.preprocess(
    (v) => (v === '' ? null : v),
    z.union([IdSchema, z.null()]).optional().default(null),
  ),
})

/** PUT /api/travels/by-slug/[slug] */
export const UpdateTravelInfoSchema = z.object({
  title: z.string().trim().min(1, '旅行名称不能为空').max(120, '旅行名称过长（最多 120 字）').optional(),
  location: z.string().max(255, '目的地过长').optional(),
  description: z.string().max(50_000, '描述过长').nullable().optional(),
  startDate: NullableDateStringSchema.optional(),
  endDate: NullableDateStringSchema.optional(),
  budget: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .union([
        z.coerce
          .number({ message: '预算需为不小于 0 的数字' })
          .finite('预算需为不小于 0 的数字')
          .min(0, '预算需为不小于 0 的数字')
          .max(100_000_000, '预算数值过大'),
        z.null(),
      ])
      .optional(),
  ),
  coverMediaId: z.preprocess(
    (v) => (v === '' ? null : v),
    z.union([IdSchema, z.null()]).optional(),
  ),
})
