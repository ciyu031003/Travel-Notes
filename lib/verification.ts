import { randomInt, createHash } from 'crypto'
import { prisma } from './db'

export const CODE_EXPIRY_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 50 * 1000
const MAX_ATTEMPTS = 5

export type CodePurpose = 'BIND_EMAIL' | 'RESET'

interface ActiveCode {
  id: number
  codeHash: string
  expiresAt: Date
  attempts: number
  createdAt: Date
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** 生成 6 位随机验证码（100000-999999） */
export function generateVerificationCode(): string {
  return String(randomInt(100000, 1000000))
}

async function findActiveCode(email: string, purpose: CodePurpose): Promise<ActiveCode | null> {
  return prisma.verificationCode.findFirst({
    where: {
      email,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { id: 'desc' },
  })
}

async function storeCode(email: string, code: string, purpose: CodePurpose, ipHash?: string | null): Promise<{ exp: number }> {
  const exp = Date.now() + CODE_EXPIRY_MS
  await prisma.verificationCode.create({
    data: {
      email,
      purpose,
      codeHash: hashCode(code),
      expiresAt: new Date(exp),
      ipHash: ipHash || null,
    },
  })
  return { exp }
}

async function verifyCode(email: string, code: string, purpose: CodePurpose): Promise<boolean> {
  const entry = await findActiveCode(email, purpose)
  if (!entry) return false

  if (entry.codeHash === hashCode(code)) {
    return true
  }

  const nextAttempts = entry.attempts + 1
  await prisma.verificationCode.update({
    where: { id: entry.id },
    data: {
      attempts: nextAttempts,
      consumedAt: nextAttempts >= MAX_ATTEMPTS ? new Date() : null,
    },
  })
  return false
}

async function consumeCode(email: string, purpose: CodePurpose): Promise<void> {
  const entry = await findActiveCode(email, purpose)
  if (entry) {
    await prisma.verificationCode.update({
      where: { id: entry.id },
      data: { consumedAt: new Date() },
    })
  }
}

async function getStatus(email: string, purpose: CodePurpose): Promise<{ canSend: boolean; remainingSeconds: number }> {
  const entry = await findActiveCode(email, purpose)
  if (!entry) return { canSend: true, remainingSeconds: 0 }
  const now = Date.now()
  const remaining = Math.ceil((entry.expiresAt.getTime() - now) / 1000)
  const canSend = entry.createdAt.getTime() + RESEND_COOLDOWN_MS <= now
  return { canSend, remainingSeconds: Math.max(0, remaining) }
}

// ===== 绑定邮箱验证码 =====
export function storeVerificationCode(email: string, code: string, ipHash?: string | null): Promise<{ exp: number }> {
  return storeCode(email, code, 'BIND_EMAIL', ipHash)
}
export function verifyVerificationCode(email: string, code: string): Promise<boolean> {
  return verifyCode(email, code, 'BIND_EMAIL')
}
export function consumeVerificationCode(email: string): Promise<void> {
  return consumeCode(email, 'BIND_EMAIL')
}
export function getVerificationCodeStatus(email: string): Promise<{ canSend: boolean; remainingSeconds: number }> {
  return getStatus(email, 'BIND_EMAIL')
}

// ===== 密码重置验证码 =====
export function storeResetCode(email: string, code: string, ipHash?: string | null): Promise<{ exp: number }> {
  return storeCode(email, code, 'RESET', ipHash)
}
export function verifyResetCode(email: string, code: string): Promise<boolean> {
  return verifyCode(email, code, 'RESET')
}
export function consumeResetCode(email: string): Promise<void> {
  return consumeCode(email, 'RESET')
}
export function getResetCodeStatus(email: string): Promise<{ canSend: boolean; remainingSeconds: number }> {
  return getStatus(email, 'RESET')
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}
