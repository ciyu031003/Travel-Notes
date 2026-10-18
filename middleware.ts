import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { isPublicRequest, isStaticAssetPath } from '@/lib/public-paths'
import { resolveCorsOrigin, isUnverifiableCrossSiteRequest } from '@/lib/request-utils'
import { resolveJwtSecret } from '@/lib/jwt-secret'

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret('middleware'))

/**
 * 安全响应头（Security Headers）：
 * - CSP：限制脚本/样式/资源来源，阻止外部脚本注入
 * - HSTS：强制 HTTPS（生产环境）
 * - X-Content-Type-Options：禁止 MIME 嗅探
 * - Referrer-Policy / Permissions-Policy / Frame 防护
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  const isProd = process.env.NODE_ENV === 'production'
  const isHttps = (process.env.NEXT_PUBLIC_SITE_URL || '').startsWith('https://')

  const csp = [
    "default-src 'self'",
    // 生产移除 'unsafe-eval'：React 19 / Next 15 / mermaid / katex 运行期均不需要 eval，
    // 保留会明显削弱 CSP 防线；开发模式 HMR（react-refresh）依赖 eval，仅开发保留。
    isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://giscus.app",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd && isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  )
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  if (isProd && isHttps) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }
  return response
}

/**
 * 移动端本地壳（跨域）访问服务器 API：对允许的来源回显 Origin + 允许携带凭据。
 * 判定逻辑统一在 lib/request-utils.ts（resolveCorsOrigin）：Capacitor 本地壳
 * （https://localhost / capacitor://localhost）始终放行（生产也是，否则线上 App 直接不可用）；
 * 其余优先完整 origin 白名单 CORS_ALLOWED_ORIGINS，未配置时回落历史 hostname 行为；
 * 浏览器侧普通 localhost/127.0.0.1 仅非生产放行。
 */
function applyCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const allowedOrigin = resolveCorsOrigin(request)
  if (!allowedOrigin) return response
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  // Vary: Origin 必须保留：缓存/CDN 不能把 A 源的 CORS 响应复用给 B 源
  const vary = response.headers.get('Vary')
  response.headers.set('Vary', vary && !/\borigin\b/i.test(vary) ? `${vary}, Origin` : 'Origin')
  return response
}

function applyStaticCacheHeaders(response: NextResponse, pathname: string): NextResponse {
  // 不可变的图片变体（-thumbnail/-preview/-blur.jpg）允许长期缓存
  const isImmutableVariant = /-(thumbnail|preview|blur)\.(jpg|jpeg|png|webp)$/.test(pathname)
  if (isImmutableVariant) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  }
  return response
}

function finalizeResponse(response: NextResponse, request: NextRequest): NextResponse {
  return applyCorsHeaders(applySecurityHeaders(response), request)
}

async function verifyJWT(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET, {
      issuer: 'travel-notes',
    })
    return true
  } catch {
    return false
  }
}

/**
 * 生产环境 Cookie 未启用 Secure 时的启动告警（P1-13）。
 * 只 warn 一次（模块级标记），不 throw：直接拒绝启动会让存量部署升级即宕机，
 * 但必须把风险显式记录到日志里（App 端已强制 Secure，Web 端仍需配置 COOKIE_SECURE=true）。
 */
let warnedInsecureCookie = false
function warnIfInsecureCookie(): void {
  if (warnedInsecureCookie || process.env.NODE_ENV !== 'production') return
  warnedInsecureCookie = true
  if (process.env.COOKIE_SECURE === 'true') return
  console.warn(
    '[WARN] 生产环境未设置 COOKIE_SECURE=true：admin_session Cookie 缺少 Secure 标记，' +
      '存在被明文网络窃取的风险，请配置 COOKIE_SECURE=true（HTTPS 部署）。'
  )
}

function normalizeHostname(host: string): string {
  try {
    return new URL(host.includes('://') ? host : 'https://' + host).hostname
  } catch {
    // 兼容不带 scheme/未知格式的主机，取端口前的部分
    return host.split(':')[0]
  }
}

/**
 * 计算允许的 Origin 主机名集合。
 * 覆盖：请求真实 Host、反向代理透传的 X-Forwarded-Host、配置的站点域名/IP、本地调试 host。
 * 说明：middleware 的 nextUrl.hostname 在反代后不一定同步 Host 头，因此须以请求头为准做同源判断。
 */
function allowedOriginHostnames(request: NextRequest): Set<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const candidates: string[] = [
    request.nextUrl.hostname,
    request.headers.get('host') || '',
    request.headers.get('x-forwarded-host') || '',
    siteUrl,
    'localhost',
    '127.0.0.1',
  ]
  const result = new Set<string>()
  for (const c of candidates) {
    if (!c) continue
    result.add(normalizeHostname(c))
  }
  return result
}

/**
 * CSRF 防护：非 GET/HEAD/OPTIONS 请求校验 Origin 与 Host 一致。
 * - Origin 为 'null'/不可解析时（微信/WebView/透明代理），若浏览器标注了
 *   `Sec-Fetch-Site: cross-site` 则 403（P1-13）；否则放行 —— Capacitor WebView 会发
 *   Origin: null，硬拒绝会让 App 内写请求全部失败，此时仍由 SameSite Cookie 兜底。
 * - 无 Origin 的请求（curl/服务器间调用/移动端）放行。
 * - 跨站浏览器请求 Origin 与 Host 不一致时拒绝。
 */
function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null
  }

  if (isUnverifiableCrossSiteRequest(request)) {
    return applySecurityHeaders(
      NextResponse.json({ error: '跨站请求被拒绝', code: 'CROSS_SITE_ORIGIN' }, { status: 403 })
    )
  }

  const origin = request.headers.get('origin')
  // Origin 缺失或为字符串 'null'：没有可校验的来源，交给 SameSite Cookie 兜底（App 兼容）
  if (!origin || origin === 'null') return null

  let originHostname: string
  try {
    originHostname = new URL(origin).hostname
  } catch {
    // 无法解析的 Origin 不拦截（已在 Sec-Fetch-Site: cross-site 时上面拦过），避免误伤正常登录
    return null
  }

  if (!allowedOriginHostnames(request).has(originHostname)) {
    return applySecurityHeaders(
      NextResponse.json({ error: '跨站请求被拒绝', code: 'CROSS_SITE_ORIGIN' }, { status: 403 })
    )
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  warnIfInsecureCookie()

  // 静态资源早放行（matcher 只排除 _next；带点动态段不再整条绕过登录门禁）
  if (isStaticAssetPath(pathname)) {
    return finalizeResponse(NextResponse.next(), request)
  }

  // CORS 预检（移动端本地壳跨域访问服务器 API）
  if (request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 })
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Type')
    res.headers.set('Access-Control-Max-Age', '86400')
    return applyCorsHeaders(res, request)
  }

  const csrfResponse = rejectCrossOrigin(request)
  if (csrfResponse) return applyCorsHeaders(csrfResponse, request)

  // 首页及公开前缀路径直接放行；公开内容读路径（游客浏览）也放行（写请求仍要求登录）
  if (isPublicRequest(pathname, request.method)) {
    let res = finalizeResponse(NextResponse.next(), request)
    if (pathname === '/uploads' || pathname.startsWith('/uploads/')) res = applyStaticCacheHeaders(res, pathname)
    return res
  }

  const adminSession = request.cookies.get('admin_session')

  if (!adminSession || !adminSession.value) {
    /**
     * 未登录访问站点根 → 送**门户落地页**，而不是登录页（2026-10-12）。
     *
     * 背景：nginx 此前用 `location = / { return 301 /portal/; }` 把根固定跳门户，
     * 访客能看到落地页，但**已登录用户点「进入空间」也会被这条 301 弹回门户** ——
     * 表现为页面闪烁一下却始终停在门户（用户反馈的 bug）。
     *
     * 现在把「根路径该去哪」的决策从 nginx 上移到应用（这里），因为它需要登录态：
     *   · 已登录 → 放行，渲染 app/page.tsx（真正的应用首页）
     *   · 未登录 → 跳 /portal/（门户落地页，保持访客体验不变）
     * 对应地，nginx 的 `location = /` 改为反代应用。
     */
    if (pathname === '/') {
      const portalUrl = new URL('/portal/', request.url)
      return finalizeResponse(NextResponse.redirect(portalUrl), request)
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return finalizeResponse(NextResponse.redirect(loginUrl), request)
  }

  const isValid = await verifyJWT(adminSession.value)
  if (!isValid) {
    const response = NextResponse.next()
    response.cookies.set('admin_session', '', { maxAge: 0, path: '/' })

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return finalizeResponse(NextResponse.redirect(loginUrl), request)
  }

  return finalizeResponse(NextResponse.next(), request)
}

export const config = {
  // 注意：不得用「路径含点即排除」(.*) —— 带点动态段会整条绕过登录门禁；
  // 静态资源豁免收敛到 isStaticAssetPath()（lib/public-paths.ts，测试共用）。
  matcher: ['/((?!_next/static|_next/image).*)', '/uploads/:path*'],
}
