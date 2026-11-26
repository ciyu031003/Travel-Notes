/**
 * Space 旅行计划 API schema（S3）。
 *
 * 与 `space.ts` 同风格：zod 负责格式与基础范围，业务校验（成员角色、
 * 日期先后、slug 唯一）仍在 service 层，避免两处规则漂移。
 */
import { z } from 'zod'
import { NullableDateStringSchema } from './common'

export const PlanStatusSchema = z.enum(['PLANNING', 'CONFIRMED', 'DONE'], { message: '计划状态不合法' })

export const PlanTaskKindSchema = z.enum(['TODO', 'PACK', 'PLACE'], { message: '清单类型不合法' })

/** 预算：允许 null / 空串（= 不填），字符串数字按数字解析 */
const BudgetSchema = z.preprocess(
  (v) => {
    if (v === null || v === '') return null
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : v
    }
    return v
  },
  z
    .number({ message: '预算需为数字' })
    .min(0, '预算不能为负数')
    .max(100_000_000, '预算数值过大')
    .nullable(),
)

export const PlanTaskSchema = z.object({
  id: z.string().trim().max(64, '清单项 id 过长').optional(),
  text: z
    .string({ message: '清单内容不能为空' })
    .trim()
    .min(1, '清单内容不能为空')
    .max(120, '清单项最多 120 个字符'),
  kind: PlanTaskKindSchema.catch('TODO'),
  done: z.boolean().catch(false),
  doneBy: z.string().max(255).nullable().optional(),
  doneAt: z.string().max(40).nullable().optional(),
})

export const PlanTasksSchema = z.array(PlanTaskSchema).max(100, '清单最多 100 项')

/** POST /api/spaces/[id]/plans */
export const CreateSpacePlanSchema = z.object({
  title: z
    .string({ message: '计划标题不能为空' })
    .trim()
    .min(1, '计划标题不能为空')
    .max(200, '计划标题最多 200 个字符'),
  destination: z.string().trim().max(200, '目的地最多 200 个字符').nullable().optional(),
  startDate: NullableDateStringSchema.optional(),
  endDate: NullableDateStringSchema.optional(),
  budget: BudgetSchema.optional(),
  note: z.string().max(5000, '备注最多 5000 个字符').nullable().optional(),
  status: PlanStatusSchema.optional(),
  tasks: PlanTasksSchema.optional(),
})

/** PATCH /api/spaces/[id]/plans/[planId]：任意子集；或单条勾选 toggleTask */
export const UpdateSpacePlanSchema = CreateSpacePlanSchema.partial().extend({
  toggleTask: z
    .object({
      id: z.string().trim().min(1, '缺少清单项 id'),
      done: z.boolean().optional(),
    })
    .optional(),
})
