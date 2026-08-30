/**
 * 中间件公开路径白名单（唯一事实源，middleware.ts 与安全测试共用）。
 */

export const PUBLIC_PATHS = [
  '/login',
  '/admin/login',
  '/admin/setup',
  '/admin/change-password',
  '/forgot-password',
  '/api/login',
  '/api/check-auth',
  '/api/logout',
  '/api/verify-album-password',
  '/api/admin/login',
  '/api/admin/check',
  '/api/admin/logout',
  '/api/admin/setup',
  // '/api/admin/settings' 有意不在公开列表：全部子路由各自 requireAuth（不应整段公开）
  '/api/admin/force-change-password',
  '/api/forgot-password',
  '/api/register',
  '/api/version',
  '/api/health',
  '/api/uploads',
  '/uploads',
  '/_next',
]

/** 段边界匹配：/api/login 命中 /api/login 与 /api/login/x，但不误放 /api/login-xyz */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
}
