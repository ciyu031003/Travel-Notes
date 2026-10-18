import { z } from 'zod'

/**
 * 密码策略（P1-12）：注册 / 重置 / 改密 / 初始化统一走 validatePassword。
 * 此前各处最小长度不一致（注册 6 / setup 8 / 忘记密码 6），且没有弱口令拦截。
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/**
 * 常见弱口令黑名单（30 条，小写比较）。
 * 目的不是穷举，而是拦住「注册即被撞库」的那一批：纯数字连号、键盘序列、产品名+123 等。
 */
const WEAK_PASSWORDS = new Set<string>([
  '12345678', '123456789', '1234567890', '11111111', '00000000', '88888888',
  '87654321', '12341234', '1qaz2wsx', '1q2w3e4r', 'qwertyui', 'qwerty123',
  'asdfghjk', 'zxcvbnm1', 'abcd1234', 'abc12345', 'a1234567', 'a12345678',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd',
  'iloveyou', 'admin123', 'admin1234', 'letmein1', 'welcome1', 'sunshine',
  'princess', 'football', 'baseball', 'superman', 'trustno1', 'travel123',
])

export type PasswordValidationResult = { valid: true } | { valid: false; message: string }

/** 供各处复用的密码校验（中文提示，直接返回给前端） */
export function validatePassword(password: string | null | undefined): PasswordValidationResult {
  const value = String(password ?? '')
  if (value.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `密码至少需要 ${PASSWORD_MIN_LENGTH} 位字符` }
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, message: `密码长度不能超过 ${PASSWORD_MAX_LENGTH} 位` }
  }
  if (WEAK_PASSWORDS.has(value.toLowerCase())) {
    return { valid: false, message: '该密码过于常见，请换一个更难猜的密码' }
  }
  // 单字符重复（aaaaaaaa / 11111111）：黑名单没穷举到的同类弱口令
  if (/^(.)\1+$/.test(value)) {
    return { valid: false, message: '该密码过于简单，请使用字母、数字或符号的组合' }
  }
  return { valid: true }
}

/** zod 版密码校验：错误信息复用 validatePassword，保证路由与 service 文案一致 */
export const PasswordSchema = z
  .string()
  .superRefine((value, ctx) => {
    const result = validatePassword(value)
    if (!result.valid) ctx.addIssue({ code: 'custom', message: result.message })
  })

export const LoginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
  rememberMe: z.boolean().optional(),
})

export function validateLogin(input: unknown): { success: true; data: { username: string; password: string; rememberMe?: boolean } } | { success: false; error: z.ZodError } {
  return LoginSchema.safeParse(input)
}

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空'),
  // 与注册/重置/setup 对齐为同一策略（P1-12）
  newPassword: PasswordSchema,
})

export function validateChangePassword(input: unknown): { success: true; data: { currentPassword: string; newPassword: string } } | { success: false; error: z.ZodError } {
  return ChangePasswordSchema.safeParse(input)
}

export const RegisterSchema = z.object({
  username: z.string().min(2, '用户名至少 2 位').max(20, '用户名最多 20 位'),
  // 注意：长度/弱口令校验统一在 PasswordSchema（与 setup/重置一致）
  password: PasswordSchema,
  rememberMe: z.boolean().optional(),
  clientType: z.enum(['app', 'web']).optional(),
})

export function validateRegister(input: unknown): { success: true; data: { username: string; password: string; rememberMe?: boolean; clientType?: 'app' | 'web' } } | { success: false; error: z.ZodError } {
  return RegisterSchema.safeParse(input)
}

export const ResetPasswordSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  code: z.string().length(6, '验证码为 6 位数字'),
  newPassword: PasswordSchema,
})
