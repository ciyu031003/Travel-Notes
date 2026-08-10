import { randomInt } from 'crypto'

interface CodeEntry {
  code: string
  exp: number
  attempts: number
}

const verificationCodes = new Map<string, CodeEntry>()
const resetCodes = new Map<string, CodeEntry>()

const CODE_EXPIRY = 5 * 60 * 1000
const RESEND_COOLDOWN = 50 * 1000
const MAX_ATTEMPTS = 5

/** 生成 6 位随机验证码（100000-999999），不再使用固定演示码。 */
export function generateVerificationCode(): string {
  return String(randomInt(100000, 1000000))
}


export function storeVerificationCode(email: string, code: string): { exp: number } {
  const exp = Date.now() + CODE_EXPIRY
  verificationCodes.set(email, { code, exp, attempts: 0 })
  return { exp }
}

/**
 * 校验邮箱验证码。失败时累计尝试次数，超过上限即作废该验证码（需重新发送）。
 * 校验成功不自动删除，由调用方显式 consumeVerificationCode。
 */
export function verifyVerificationCode(email: string, code: string): boolean {
  const entry = verificationCodes.get(email)
  if (!entry) return false
  if (entry.exp < Date.now()) {
    verificationCodes.delete(email)
    return false
  }
  if (entry.code === code) {
    return true
  }
  entry.attempts += 1
  if (entry.attempts >= MAX_ATTEMPTS) {
    verificationCodes.delete(email)
  }
  return false
}

export function consumeVerificationCode(email: string): void {
  verificationCodes.delete(email)
}

export function getVerificationCodeStatus(email: string): { canSend: boolean; remainingSeconds: number } {
  const entry = verificationCodes.get(email)
  if (!entry || entry.exp < Date.now()) {
    return { canSend: true, remainingSeconds: 0 }
  }
  const now = Date.now()
  const remaining = Math.ceil((entry.exp - now) / 1000)
  const canSend = remaining > RESEND_COOLDOWN / 1000
  return { canSend, remainingSeconds: remaining }
}

export function storeResetCode(email: string, code: string): { exp: number } {
  const exp = Date.now() + CODE_EXPIRY
  resetCodes.set(email, { code, exp, attempts: 0 })
  return { exp }
}

/**
 * 校验密码重置验证码。失败时累计尝试次数，超过上限即作废（需重新获取）。
 * 校验成功不自动删除，由调用方显式 consumeResetCode（verify-code 步骤通过后 reset 步骤仍可使用）。
 */
export function verifyResetCode(email: string, code: string): boolean {
  const entry = resetCodes.get(email)
  if (!entry) return false
  if (entry.exp < Date.now()) {
    resetCodes.delete(email)
    return false
  }
  if (entry.code === code) {
    return true
  }
  entry.attempts += 1
  if (entry.attempts >= MAX_ATTEMPTS) {
    resetCodes.delete(email)
  }
  return false
}

export function consumeResetCode(email: string): void {
  resetCodes.delete(email)
}

export function getResetCodeStatus(email: string): { canSend: boolean; remainingSeconds: number } {
  const entry = resetCodes.get(email)
  if (!entry || entry.exp < Date.now()) {
    return { canSend: true, remainingSeconds: 0 }
  }
  const now = Date.now()
  const remaining = Math.ceil((entry.exp - now) / 1000)
  const canSend = remaining > RESEND_COOLDOWN / 1000
  return { canSend, remainingSeconds: remaining }
}

/** 是否已配置真实邮件发送（未配置时验证码仅输出到服务端日志，供本地演示）。 */
export function isEmailDeliveryConfigured(): boolean {
  return process.env.EMAIL_ENABLED === 'true'
}
