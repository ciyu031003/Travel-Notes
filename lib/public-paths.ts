/**
 * 中间件公开路径白名单（唯一事实源，middleware.ts 与安全测试共用）。
 *
 * 两级模型：
 * - PUBLIC_PATHS：完全公开（不区分方法），如登录/注册/健康检查/上传静态资源。
 * - PUBLIC_READ_PATHS：公开内容读路径 —— 游客可浏览公开内容（产品规则：记录需登录）。
 *   仅放行 GET/HEAD/OPTIONS；写方法（POST/PUT/DELETE）仍需登录（走中间件登录重定向）。
 *   数据可见性仍由各 API 的 scopedWhere 保证（匿名只返回公开内容）。
 */

export const PUBLIC_PATHS = [
  '/login',
  '/download',
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

/**
 * 公开内容读路径（游客只读浏览；写操作仍要求登录）。
 * 与 scopedWhere 可见性模型一致：匿名请求只返回「公开/可见」内容，不泄露私人数据。
 */
export const PUBLIC_READ_PATHS = [
  // 首页聚合 / 旅行 / 时间线 / 看板
  '/api/home',
  '/api/travels',
  '/api/timeline',
  '/api/dashboard',
  // 碎碎念 / 搜索
  '/api/moments',
  '/api/search',
  // 旅行圈（Feed / 用户主页）
  '/api/social/posts',
  '/api/social/users',
  // 画册 / 相册（相册由 album_token 自守卫，未解锁 403 走解锁弹层）
  '/api/travel-book',
  '/api/album',
  // 纪念日 / 弹幕 / RSS / 历史图片（内容图）
  '/api/anniversaries',
  '/api/danmaku',
  '/api/images',
  '/feed.xml',
]

/** 段边界匹配：/api/login 命中 /api/login 与 /api/login/x，但不误放 /api/login-xyz */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
}

function isPublicReadPath(pathname: string): boolean {
  return PUBLIC_READ_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
}

/** 中间件最终判定：完全公开 或 公开内容读请求 */
export function isPublicRequest(pathname: string, method: string): boolean {
  if (isPublicPath(pathname)) return true
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  return isRead && isPublicReadPath(pathname)
}
