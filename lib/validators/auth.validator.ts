import { z } from 'zod'

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
  newPassword: z.string().min(6, '新密码至少 6 位'),
})

export function validateChangePassword(input: unknown): { success: true; data: { currentPassword: string; newPassword: string } } | { success: false; error: z.ZodError } {
  return ChangePasswordSchema.safeParse(input)
}

export const RegisterSchema = z.object({
  username: z.string().min(2, '用户名至少 2 位').max(20, '用户名最多 20 位'),
  password: z.string().min(6, '密码至少 6 位').max(72, '密码过长'),
  rememberMe: z.boolean().optional(),
})

export function validateRegister(input: unknown): { success: true; data: { username: string; password: string; rememberMe?: boolean } } | { success: false; error: z.ZodError } {
  return RegisterSchema.safeParse(input)
}
