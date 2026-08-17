import { z } from 'zod'

export const CreatePostSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug 只能包含小写字母、数字和连字符').max(255),
  title: z.string().min(1, '标题不能为空').max(255),
  content: z.string().min(1, '内容不能为空'),
  cover: z.string().max(500, '封面地址过长').optional().or(z.literal('')),
  images: z.array(z.string()).max(20).optional(),
  videos: z.array(z.object({
    url: z.string(),
    thumbnail: z.string().optional(),
    duration: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).max(10).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  location: z.string().max(255).optional(),
  date: z.string().datetime('日期格式错误').optional(),
  type: z.string().max(50),
  summary: z.string().max(500).optional().or(z.literal('')),
  published: z.boolean().optional(),
  isPublic: z.boolean().optional(),
})

export const UpdatePostSchema = CreatePostSchema.partial()

export type CreatePostInput = z.infer<typeof CreatePostSchema>
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>

export function validateCreatePost(input: unknown): { success: true; data: CreatePostInput } | { success: false; error: z.ZodError } {
  return CreatePostSchema.safeParse(input)
}

export function validateUpdatePost(input: unknown): { success: true; data: UpdatePostInput } | { success: false; error: z.ZodError } {
  return UpdatePostSchema.safeParse(input)
}

export const LoginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
  rememberMe: z.boolean().optional(),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空'),
  newPassword: z.string().min(6, '新密码至少 6 位'),
})

export const UpdateUsernameSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(255),
  currentPassword: z.string().min(1, '当前密码不能为空'),
})

export const UpdateEmailSchema = z.object({
  email: z.string().email('邮箱格式错误').nullable().optional(),
  currentPassword: z.string().min(1, '当前密码不能为空'),
})

export const UpdateAnniversarySchema = z.object({
  anniversaryStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').nullable().optional(),
  currentPassword: z.string().min(1, '当前密码不能为空'),
})
