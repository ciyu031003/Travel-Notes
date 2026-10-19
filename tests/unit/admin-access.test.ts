import { describe, it, expect } from 'vitest'
import { isAdminGuardExemptPath, resolveAdminGuard } from '@/lib/services/admin-access'

/**
 * B11：后台页面级能力守卫的纯函数决策。
 * 规则：未登录 → /admin/login；首登改密 → /admin/change-password；
 * 明确无 canManageContent → /me；能力接口不可用（null）→ 不踢人。
 */

describe('isAdminGuardExemptPath', () => {
  it('登录/改密/初始化三页豁免（否则会自己把自己踢走）', () => {
    expect(isAdminGuardExemptPath('/admin/login')).toBe(true)
    expect(isAdminGuardExemptPath('/admin/change-password')).toBe(true)
    expect(isAdminGuardExemptPath('/admin/setup')).toBe(true)
    expect(isAdminGuardExemptPath('/admin/posts')).toBe(false)
    expect(isAdminGuardExemptPath(null)).toBe(true)
  })
})

describe('resolveAdminGuard', () => {
  it('未登录 → 去登录页', () => {
    expect(
      resolveAdminGuard('/admin/posts', { authenticated: false, canManageContent: null }),
    ).toEqual({ redirect: '/admin/login', reason: 'unauthenticated' })
  })

  it('首登需改密优先于能力判断 → 去改密页', () => {
    expect(
      resolveAdminGuard('/admin/posts', {
        authenticated: true,
        requirePasswordChange: true,
        canManageContent: false,
      }),
    ).toEqual({ redirect: '/admin/change-password', reason: 'require-password-change' })
  })

  it('明确没有 canManageContent → 去 /me（普通用户不进后台壳）', () => {
    expect(
      resolveAdminGuard('/admin/posts', { authenticated: true, canManageContent: false }),
    ).toEqual({ redirect: '/me', reason: 'no-capability' })
  })

  it('有 canManageContent → 留在当前页', () => {
    expect(
      resolveAdminGuard('/admin/posts', { authenticated: true, canManageContent: true }),
    ).toEqual({ redirect: null, reason: null })
  })

  it('能力接口不可用（null）→ 不踢人（接口侧仍会 403，页面不该因抖动锁人）', () => {
    expect(
      resolveAdminGuard('/admin/posts', { authenticated: true, canManageContent: null }),
    ).toEqual({ redirect: null, reason: null })
  })

  it('豁免页即使状态异常也不跳转', () => {
    expect(
      resolveAdminGuard('/admin/login', { authenticated: false, canManageContent: false }),
    ).toEqual({ redirect: null, reason: null })
  })
})
