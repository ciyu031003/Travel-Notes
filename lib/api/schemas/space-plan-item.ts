/**
 * 计划块（SpacePlanItem）API schema（P1a）。
 *
 * 与 space-plan.ts 同风格：zod 负责格式与基础范围，业务校验（天是否属于该计划、
 * 行级 version 冲突、mediaIds 归属）仍在 service 层。
 */
import { z } from 'zod'
import { IdSchema, NullableDateStringSchema } from './common'

export const PlanItemKindSchema = z.enum(['TRANSPORT', 'HOTEL', 'FOOD', 'SPOT', 'ACTIVITY', 'FLEX'], {
  message: '块类型不合法',
})

const PlanTransportModeSchema = z.enum(['FLIGHT', 'TRAIN', 'DRIVE', 'MIXED'], { message: '交通方式不合法' })
const PlanPaceSchema = z.enum(['RELAXED', 'STANDARD', 'PACKED'], { message: '节奏不合法' })
const PlanInterestSchema = z.enum(['美食', '自然', '人文', '购物', '亲子', '夜生活'], { message: '兴趣不合法' })

/** 花销：单位「分」，允许 null/空串；字符串数字按数字解析 */
const CostCentsSchema = z.preprocess((v) => {
  if (v === null || v === '') return null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : v
  }
  return v
}, z.number({ message: '花销需为数字（单位：分）' }).int('花销需为整数分').min(0, '花销不能为负数').max(1_000_000_000, '花销数值过大').nullable())

export const PlanMediaIdsSchema = z.array(IdSchema).max(50, '每块最多 50 张照片')

/** POST .../plans/[planId]/items */
export const CreatePlanItemSchema = z.object({
  dayId: IdSchema,
  kind: PlanItemKindSchema.optional(),
  // 允许先加「空块」再填（P2 交互）：缺省时服务端落占位标题「待定」
  title: z.string().trim().max(200, '块标题最多 200 个字符').optional(),
  startAt: NullableDateStringSchema.optional(),
  endAt: NullableDateStringSchema.optional(),
  place: z.string().trim().max(200, '地点最多 200 个字符').nullable().optional(),
  costCents: CostCentsSchema.optional(),
  note: z.string().max(5000, '备注最多 5000 个字符').nullable().optional(),
  done: z.boolean().optional(),
  mediaIds: PlanMediaIdsSchema.optional(),
})

/** PATCH .../items/[itemId]：任意子集，但**必须**带行级 version */
export const UpdatePlanItemSchema = z.object({
  version: z.coerce.number({ message: '改块必须带 version' }).int('version 不合法').min(0, 'version 不合法'),
  kind: PlanItemKindSchema.optional(),
  title: z.string().trim().max(200, '块标题最多 200 个字符').optional(),
  startAt: NullableDateStringSchema.optional(),
  endAt: NullableDateStringSchema.optional(),
  place: z.string().trim().max(200, '地点最多 200 个字符').nullable().optional(),
  costCents: CostCentsSchema.optional(),
  note: z.string().max(5000, '备注最多 5000 个字符').nullable().optional(),
  done: z.boolean().optional(),
  mediaIds: PlanMediaIdsSchema.optional(),
})

/** POST .../items/[itemId]/move */
export const MovePlanItemSchema = z.object({
  dayId: IdSchema,
  sortOrder: z.coerce.number().int().min(0, '排序不能为负数').max(999, '排序数值过大').optional(),
})

/** POST .../items/[itemId]/toggle：done 省略时按当前值取反（原子） */
export const TogglePlanItemSchema = z
  .object({
    done: z.boolean().optional(),
  })
  .optional()

/** GET .../events?since= */
export const PlanEventsQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(200),
})

/** POST .../collab-token：无 body */
export const CollabTokenSchema = z.object({}).optional()

/** 创建计划时的引擎输入（挂在 CreateSpacePlanSchema 上） */
export const PlanEngineInputSchema = {
  departureCity: z.string().trim().max(100, '出发地最多 100 个字符').nullable().optional(),
  transportMode: PlanTransportModeSchema.optional(),
  pace: PlanPaceSchema.optional(),
  interests: z.array(PlanInterestSchema).max(6, '兴趣最多选 6 个').optional(),
  travelers: z.array(z.string().trim().max(100)).max(30, '同行者最多 30 人').optional(),
}
