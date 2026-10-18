/**
 * 密码强度评估（P2-32）。
 *
 * 服务端唯一事实源仍是 lib/validators/auth.validator.ts 的 validatePassword
 * （≥8 / 36 条弱口令黑名单 / 单字符重复 / ≤128），这里**显式复用**而不是另写一套，
 * 避免出现「前端显示中等、提交却被服务端拒绝」的口径分裂。
 *
 * 注意：本文件只产出展示用的强度档位，**不做提交前拦截** —— 提交仍由
 * /api/admin/settings/password 等服务端校验决定（行为与拆分前一致）。
 */
import { validatePassword } from './auth.validator'

export { validatePassword }

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4 | 5

export interface PasswordStrength {
  /** 0 = 未输入（不显示强度条）；1–5 对应历史五档 */
  score: PasswordStrengthScore
  /** 档位文案（保持拆分前的既有文案） */
  label: '' | '太弱' | '弱' | '中等' | '强' | '非常强'
  /** 是否满足服务端密码策略（弱口令 / 过短 / 单字符重复 / 超长 ⇒ false） */
  valid: boolean
  /** 服务端拒绝时的中文原因；未拒绝为 null（供 UI 选用，不改变提交行为） */
  invalidReason: string | null
}

/**
 * 服务端会拒绝的密码，强度上限锁在「弱」。
 *
 * 为什么需要：此前强度条是纯启发式（长度/大写/数字/符号），password123 会显示
 * 「弱」甚至更高，但服务端弱口令黑名单直接拒绝 —— 用户按强度条改密码却提交失败。
 * 现在「有效性」以服务端同一实现为准，无效密码最多显示「弱」。
 */
export const INVALID_PASSWORD_MAX_SCORE: PasswordStrengthScore = 2

type StrengthLevel = { score: PasswordStrengthScore; label: PasswordStrength['label'] }

const LEVELS: StrengthLevel[] = [
  { score: 0, label: '' },
  { score: 1, label: '太弱' },
  { score: 2, label: '弱' },
  { score: 3, label: '中等' },
  { score: 4, label: '强' },
  { score: 5, label: '非常强' },
]

/**
 * 评估密码强度。
 *
 * 评分沿用拆分前 page.tsx 内联的启发式规则（≥6、≥10、大写、数字、符号各 +1），
 * 以保证**合法密码的显示与拆分前完全一致**；额外的「服务端有效性」只用于给
 * 无效密码封顶，防止强度条与提交结果相反。
 */
export function evaluatePassword(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: '', valid: false, invalidReason: null }
  }

  const policy = validatePassword(password)

  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (!policy.valid) score = Math.min(score, INVALID_PASSWORD_MAX_SCORE)

  const level = LEVELS[Math.min(score, 5)]
  return {
    score: level.score,
    label: level.label,
    valid: policy.valid,
    invalidReason: policy.valid ? null : policy.message,
  }
}
