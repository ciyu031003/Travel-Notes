/**
 * 后台写路由的共享 zod schema（P1-17 收尾）。
 *
 * 约定：
 * - 数字 id / page / pageSize 一律 z.coerce.number().int().positive()（URL/表单来的都是字符串）；
 * - 失败信息为中文、面向用户，由 parseBody 抛 ApiError('VALIDATION_ERROR', ...) 统一成
 *   { success:false, error, code, requestId }；
 * - 只校验形状与长度，不改业务语义（可见性/归属仍由 service 层判定）。
 */
import { z } from 'zod'
import { PasswordSchema } from '@/lib/validators/auth.validator'

/** 正整数 ID（路径参数/body 里的外键） */
export const IdSchema = z.coerce.number().int('ID 必须为整数').positive('ID 必须为正整数')

/** 列表分页 query（page/pageSize 来自 URL，都是字符串） */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
})

export const EmailSchema = z.string().trim().email('请输入有效的邮箱地址').max(255, '邮箱过长')

/** 6 位数字验证码 */
export const VerificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, '请输入 6 位数字验证码')

export const CurrentPasswordSchema = z.string().min(1, '请输入当前密码').max(128, '密码过长')

export const NewUsernameSchema = z
  .string()
  .trim()
  .min(2, '用户名至少 2 位')
  .max(20, '用户名最多 20 位')
  .regex(/^[\w\u4e00-\u9fa5]+$/, '用户名仅支持中文、字母、数字、下划线')

export const NewPasswordSchema = PasswordSchema

/** 相册创建（admin/albums POST） */
export const AlbumCreateSchema = z.object({
  title: z.string().trim().min(1, '请输入相册名称').max(255, '相册名称过长'),
  description: z.string().max(50_000, '描述过长').nullable().optional(),
  date: z.string().max(64).nullable().optional(),
  isPublic: z.boolean().optional(),
  travelId: IdSchema.nullable().optional(),
})

/** 相册更新（admin/albums/[id] PUT）：全部可选，至少给一个字段 */
export const AlbumUpdateSchema = z.object({
  title: z.string().trim().min(1, '请输入相册名称').max(255, '相册名称过长').optional(),
  description: z.string().max(50_000, '描述过长').nullable().optional(),
  date: z.string().max(64).nullable().optional(),
  isPublic: z.boolean().optional(),
  travelId: IdSchema.nullable().optional(),
})

/** 相册移除媒体（admin/albums/[id]/media DELETE） */
export const AlbumMediaDeleteSchema = z.object({ mediaId: IdSchema })

/** 纪念日创建（admin/anniversaries POST） */
export const AnniversaryCreateSchema = z.object({
  title: z.string().trim().min(1, '请输入纪念日名称').max(255, '纪念日名称过长'),
  date: z.string().min(1, '请输入有效日期').max(64),
  recurring: z.boolean().optional(),
  description: z.string().max(50_000, '描述过长').nullable().optional(),
})

/** 纪念日更新（admin/anniversaries/[id] PUT） */
export const AnniversaryUpdateSchema = z.object({
  title: z.string().trim().min(1, '请输入纪念日名称').max(255, '纪念日名称过长').optional(),
  date: z.string().min(1, '无效日期').max(64).optional(),
  recurring: z.boolean().optional(),
  description: z.string().max(50_000, '描述过长').nullable().optional(),
})

/** 碎碎念发布（admin/moments POST） */
export const MomentCreateSchema = z.object({
  content: z.string().trim().min(1, '内容不能为空').max(2000, '内容过长（最多 2000 字）'),
  tags: z.array(z.string().max(50, '标签过长')).max(10, '最多 10 个标签').optional(),
  isPublic: z.boolean().optional(),
})

/** 分享到旅行圈（admin/posts/[id]/share POST） */
export const ShareToCircleSchema = z.object({
  travelId: IdSchema.nullable().optional(),
  visibility: z.enum(['SPACE', 'PUBLIC']).optional(),
})

/** Markdown 预览（admin/preview POST） */
export const PreviewSchema = z.object({
  content: z.string().min(1, '缺少 content').max(200_000, '内容过长'),
})

/** 设置合并更新（admin/settings POST：当前密码 + 可选新用户名/新密码） */
export const SettingsUpdateSchema = z.object({
  currentPassword: CurrentPasswordSchema,
  newUsername: NewUsernameSchema.optional(),
  newPassword: NewPasswordSchema.optional(),
})

/** 改用户名（admin/settings/username POST） */
export const UsernameUpdateSchema = z.object({
  newUsername: NewUsernameSchema,
  currentPassword: CurrentPasswordSchema,
})

/** 解绑邮箱（admin/settings/email DELETE） */
export const EmailUnbindSchema = z.object({ currentPassword: CurrentPasswordSchema })

/** 绑定邮箱（admin/settings/bind-email POST） */
export const BindEmailSchema = z.object({
  email: EmailSchema,
  code: VerificationCodeSchema,
})

/** 发送邮箱验证码（admin/settings/send-code POST） */
export const SendCodeSchema = z.object({ email: EmailSchema })

/** 纪念日起点（admin/settings/anniversary POST） */
export const AnniversaryStartSchema = z.object({
  anniversaryStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式不正确')
    .nullable()
    .optional(),
  currentPassword: CurrentPasswordSchema,
})

/** 油画设置（admin/settings/oil PUT） */
export const OilSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(8, 'API key 长度不合法').max(200, 'API key 长度不合法').optional(),
  clearKey: z.boolean().optional(),
})

/** 举报处理（admin/social/reports POST） */
export const ReportActionSchema = z.object({
  reportId: IdSchema,
  action: z.enum(['DISMISS', 'TAKEDOWN_POST', 'HIDE_COMMENT', 'BAN_USER'], { message: '无效的处理动作' }),
})

/** 举报列表 query（admin/social/reports GET） */
export const ReportListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['PENDING', 'REVIEWED', 'DISMISSED', 'ACTIONED']).optional(),
})

/** 旅行日新增（admin/travels/[id]/days POST） */
export const TravelDayCreateSchema = z.object({
  date: z.string().max(64).optional(),
  title: z.string().trim().max(255, '标题过长').optional(),
  summary: z.string().max(5_000, '摘要过长').optional(),
})

/** 旅行日更新（admin/travels/[id]/days/[dayId] PUT） */
export const TravelDayUpdateSchema = z.object({
  date: z.string().max(64).nullable().optional(),
  title: z.string().trim().max(255, '标题过长').nullable().optional(),
  summary: z.string().max(5_000, '摘要过长').nullable().optional(),
})

/** 花销新增（admin/travels/[id]/expenses POST） */
export const ExpenseCreateSchema = z.object({
  amount: z.coerce.number().positive('请输入有效金额').max(100_000_000, '金额过大'),
  currency: z.string().trim().max(8).optional(),
  category: z.string().trim().max(50).optional(),
  payer: z.string().trim().max(100).optional(),
  note: z.string().trim().max(1_000, '备注过长').optional(),
  happenedAt: z.string().max(64).optional(),
})

/** 行程项新增（admin/travels/[id]/itinerary POST） */
export const ItineraryItemCreateSchema = z.object({
  dayId: IdSchema,
  title: z.string().trim().min(1, '参数不完整：dayId/title 必填').max(255, '标题过长'),
  startTime: z.string().max(16).optional(),
  endTime: z.string().max(16).optional(),
  type: z.string().trim().max(32).optional(),
  notes: z.string().max(5_000, '备注过长').optional(),
})
