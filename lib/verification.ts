const verificationCodes = new Map<string, { code: string; exp: number }>()
const resetCodes = new Map<string, { code: string; exp: number }>()

const DEFAULT_CODE = '123456'
const CODE_EXPIRY = 5 * 60 * 1000
const RESEND_COOLDOWN = 50 * 1000

export function generateVerificationCode(): string {
  return DEFAULT_CODE
}

export function storeVerificationCode(email: string, code: string): { exp: number } {
  const exp = Date.now() + CODE_EXPIRY
  verificationCodes.set(email, { code, exp })
  return { exp }
}

export function verifyVerificationCode(email: string, code: string): boolean {
  const entry = verificationCodes.get(email)
  if (!entry) return false
  if (entry.exp < Date.now()) return false
  return entry.code === code
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
  resetCodes.set(email, { code, exp })
  return { exp }
}

export function verifyResetCode(email: string, code: string): boolean {
  const entry = resetCodes.get(email)
  if (!entry) return false
  if (entry.exp < Date.now()) return false
  return entry.code === code
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