/**
 * 后台页面级能力守卫（B11）：纯函数，便于单测。
 *
 * 为什么要有页面守卫：API 侧已按能力返回 403（P0-3），但 /admin/* 页面壳仍对普通用户可打开 ——
 * 他们能看到一堆点了就 403 的菜单，体验差，也放大了误判面。
 * 这里只做「页面入口」收敛，真正的权限判定仍在服务端（前端守卫永远不是安全边界）。
 */

export type AdminGuardRedirectReason =
  | 'unauthenticated'
  | 'require-password-change'
  | 'no-capability'

export interface AdminAccessState {
  /** /api/admin/check 的 authenticated */
  authenticated: boolean
  /** /api/admin/check 的 requirePasswordChange（首登强制改密） */
  requirePasswordChange?: boolean
  /**
   * /api/me/capabilities 的 canManageContent。
   * null = 能力接口不可用（未取到）：此时只按登录态判断，不因接口抖动把管理员踢出后台。
   */
  canManageContent: boolean | null
}

export interface AdminGuardDecision {
  /** 需要跳转的路径；null = 留在当前页 */
  redirect: string | null
  reason: AdminGuardRedirectReason | null
}

/** 这些页面本身就属于「未登录/首登改密/初始化」流程，不能套守卫（否则死循环） */
const EXEMPT_PATHS = ['/admin/login', '/admin/change-password', '/admin/setup']

export function isAdminGuardExemptPath(pathname: string | null | undefined): boolean {
  if (!pathname) return true
  return EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * 计算后台页面应跳转到哪里：
 *  · 未登录 → /admin/login
 *  · 首登需改密 → /admin/change-password
 *  · 明确没有 canManageContent（=false）→ /me（普通用户不该进后台壳）
 *  · 能力接口不可用（null）→ 不跳转（fail-open 仅限页面体验，接口仍会 403）
 */
export function resolveAdminGuard(
  pathname: string | null | undefined,
  state: AdminAccessState,
): AdminGuardDecision {
  if (isAdminGuardExemptPath(pathname)) return { redirect: null, reason: null }
  if (!state.authenticated) return { redirect: '/admin/login', reason: 'unauthenticated' }
  if (state.requirePasswordChange) return { redirect: '/admin/change-password', reason: 'require-password-change' }
  if (state.canManageContent === false) return { redirect: '/me', reason: 'no-capability' }
  return { redirect: null, reason: null }
}
