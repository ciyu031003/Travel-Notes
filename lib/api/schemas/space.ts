/**
 * Space 域写路由 schema（P1-17 收尾 B）。
 * 原名/角色/天数的归一化语义保持原样（非法角色回落 MEMBER、邀请有效期夹到 1..30 天），
 * 只是把「读 body → 手工 typeof/parseInt」换成 zod 校验 + 归一。
 */
import { z } from 'zod'
import { IdSchema, NullableDateStringSchema, NullableIdSchema } from './common'
import { TravelStatusSchema, TravelTypeSchema, VisibilitySchema } from './travel'

const SpaceRoleSchema = z.enum(['OWNER', 'MEMBER', 'VIEWER'], { message: '角色不合法' })
const InviteRoleSchema = z.enum(['MEMBER', 'VIEWER'], { message: '角色不合法' })
export const SpaceTypeSchema = z.enum(['COUPLE', 'FAMILY', 'FRIENDS', 'SOLO', 'OTHER'], {
  message: '空间类型不合法',
})

/** POST /api/spaces/[id]/invites（原语义：非法 role 回落 MEMBER；天数 parseInt||7 后夹到 1..30） */
export const CreateInviteSchema = z.object({
  role: InviteRoleSchema.catch('MEMBER'),
  expiresInDays: z.coerce
    .number({ message: '有效期需为数字' })
    .int('有效期需为整数')
    .catch(7)
    .transform((n) => Math.min(30, Math.max(1, n || 7))),
})

/** POST /api/spaces/[id]/members */
export const AddSpaceMemberSchema = z.object({
  username: z.string({ message: '请输入成员用户名' }).trim().min(1, '请输入成员用户名').max(50, '用户名过长'),
  role: SpaceRoleSchema.catch('MEMBER'),
})

/** PATCH /api/spaces/[id]/members（原语义：非法 role 回落 MEMBER） */
export const UpdateSpaceMemberRoleSchema = z.object({
  username: z.string({ message: '请输入成员用户名' }).trim().min(1, '请输入成员用户名').max(50, '用户名过长'),
  role: SpaceRoleSchema.catch('MEMBER'),
})

/** DELETE /api/spaces/[id]/members（body 带 username） */
export const RemoveSpaceMemberSchema = z.object({
  username: z.string({ message: '缺少成员用户名' }).trim().min(1, '缺少成员用户名').max(50, '用户名过长'),
})

/** PATCH /api/spaces/[id] */
export const UpdateSpaceSchema = z.object({
  name: z.string().trim().min(2, '空间名称需为 2-200 个字符').max(200, '空间名称需为 2-200 个字符').optional(),
  description: z.string().max(500, '简介最多 500 个字符').nullable().optional(),
  spaceType: SpaceTypeSchema.optional(),
  coverMediaId: z.preprocess((v) => (v === '' ? null : v), z.union([IdSchema, z.null()]).optional()),
})

/** POST /api/spaces/[id]/memories */
export const CreateSpaceMemorySchema = z.object({
  title: z.string().trim().min(1, '回忆标题需为 1-255 个字符').max(255, '回忆标题需为 1-255 个字符'),
  content: z.string().max(50_000, '内容过长').nullable().optional(),
  travelId: NullableIdSchema.optional(),
  travelDayId: NullableIdSchema.optional(),
  happenedAt: NullableDateStringSchema.optional(),
  locationId: NullableIdSchema.optional(),
  mood: z.string().max(50, '心情标签过长').nullable().optional(),
  visibility: VisibilitySchema.optional(),
})

/** POST /api/spaces/[id]/travels */
export const CreateSpaceTravelSchema = z.object({
  title: z.string().trim().min(1, '旅行标题需为 1-255 个字符').max(255, '旅行标题需为 1-255 个字符'),
  slug: z
    .string({ message: '旅行标识需为 2-80 位小写字母、数字或连字符' })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,80}$/, '旅行标识需为 2-80 位小写字母、数字或连字符'),
  description: z.string().max(50_000, '描述过长').nullable().optional(),
  startDate: NullableDateStringSchema.optional(),
  endDate: NullableDateStringSchema.optional(),
  status: TravelStatusSchema.optional(),
  visibility: VisibilitySchema.optional(),
  travelType: TravelTypeSchema.optional(),
  companions: z.array(z.unknown()).max(10, '同行者最多 10 人').optional(),
})
