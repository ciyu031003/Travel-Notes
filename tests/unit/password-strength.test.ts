import { describe, it, expect } from 'vitest'
import {
  evaluatePassword,
  validatePassword,
  INVALID_PASSWORD_MAX_SCORE,
} from '@/lib/validators/password'

/**
 * 密码强度评估（P2-32）：
 *  · 评分算法从 app/admin/settings/page.tsx 抽到 lib/validators/password.ts；
 *  · 「有效性」复用服务端 validatePassword，保证 ≥8 / 弱口令 / 单字符重复
 *    三类规则与服务端完全同源（前端只是提示，不做提交前拦截）。
 */
describe('密码强度 evaluatePassword（P2-32）', () => {
  it('空密码不显示强度档位', () => {
    const strength = evaluatePassword('')
    expect(strength.score).toBe(0)
    expect(strength.label).toBe('')
    expect(strength.invalidReason).toBeNull()
  })

  it('少于 8 位：服务端拒绝，强度不超过「弱」', () => {
    expect(validatePassword('Ab1!xyz').valid).toBe(false)

    const strength = evaluatePassword('Ab1!xyz')
    expect(strength.valid).toBe(false)
    expect(strength.score).toBeLessThanOrEqual(INVALID_PASSWORD_MAX_SCORE)
    expect(strength.label).toBe('弱')
    expect(strength.invalidReason).toContain('8')
  })

  it('常见弱口令与服务端一致（password123 显示弱且服务端校验拒绝）', () => {
    expect(validatePassword('password123').valid).toBe(false)

    const strength = evaluatePassword('password123')
    expect(strength.valid).toBe(false)
    expect(strength.score).toBe(2)
    expect(strength.label).toBe('弱')
    expect(strength.invalidReason).toContain('常见')
  })

  it('单字符重复：服务端拒绝且不显示高档位', () => {
    for (const password of ['aaaaaaaa', '!!!!!!!!']) {
      expect(validatePassword(password).valid, password).toBe(false)
      const strength = evaluatePassword(password)
      expect(strength.valid, password).toBe(false)
      expect(strength.score, password).toBeLessThanOrEqual(INVALID_PASSWORD_MAX_SCORE)
    }
  })

  it('超过 128 位：服务端拒绝，强度被封顶（不再显示「非常强」）', () => {
    const password = 'a'.repeat(129) + 'Aa1!'
    expect(validatePassword(password).valid).toBe(false)

    const strength = evaluatePassword(password)
    // 纯启发式会给到 5 档；封顶后再也不会与「提交被拒」矛盾
    expect(strength.score).toBe(INVALID_PASSWORD_MAX_SCORE)
    expect(strength.label).toBe('弱')
  })

  it('足够强的密码：服务端通过且显示最高档', () => {
    for (const password of ['Travel#2026-notes', 'Str0ng#Passw0rd', 'Abcdefgh1!']) {
      expect(validatePassword(password).valid, password).toBe(true)
      const strength = evaluatePassword(password)
      expect(strength.valid, password).toBe(true)
      expect(strength.score, password).toBe(5)
      expect(strength.label, password).toBe('非常强')
      expect(strength.invalidReason, password).toBeNull()
    }
  })

  it('不变量：服务端拒绝的密码不会显示「中等」及以上', () => {
    const rejected = ['password123', '12345678', 'qwerty123', 'admin123', 'aaaaaaaa', 'Ab1!xyz', 'a'.repeat(129) + 'Aa1!']
    for (const password of rejected) {
      expect(validatePassword(password).valid, password).toBe(false)
      const strength = evaluatePassword(password)
      expect(strength.score, password).toBeLessThanOrEqual(INVALID_PASSWORD_MAX_SCORE)
      expect(['', '太弱', '弱'], password).toContain(strength.label)
    }
  })

  it('不变量：服务端通过的密码标记 valid 且档位至少为「太弱」', () => {
    for (const password of ['Travel#2026-notes', 'Str0ng#Passw0rd', 'Aaaaaaaa', 'Abcdefgh1!']) {
      expect(validatePassword(password).valid, password).toBe(true)
      const strength = evaluatePassword(password)
      expect(strength.valid, password).toBe(true)
      expect(strength.score, password).toBeGreaterThanOrEqual(1)
    }
  })

  it('档位文案与拆分前一致（五档 + 空态）', () => {
    expect(evaluatePassword('').label).toBe('')
    // 仅小写 8 位可通过服务端策略，但启发式只给 1 档（保持拆分前行为）
    expect(evaluatePassword('abcdefgh').valid).toBe(true)
    expect(evaluatePassword('abcdefgh').label).toBe('太弱')
    expect(evaluatePassword('Aaaaaaaa').label).toBe('弱')
    expect(evaluatePassword('Ab1!xyzw').label).toBe('强')
    expect(evaluatePassword('Abcdefgh1').label).toBe('中等')
  })
})
