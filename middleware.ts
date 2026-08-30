import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // 生产环境缺失密钥时拒绝启动，避免使用不安全的默认密钥
      throw new Error('[FATAL] JWT_SECRET 未配置：请设置 JWT_SECRET（可用 `openssl rand -hex 32` 生成）')
    }
    console.warn('[WARN] JWT_SECRET 未配置：使用开发环境默认密钥，切勿用于生产')
    return 'dev-only-insecure-secret'
  }
  return secret
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret())

const PUBLIC_PATHS = [
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
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))
}

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
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
 * App 壳 origin 通常是 http://localhost / capacitor://localhost，故放行 localhost 与站点域名。
 */
function applyCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin')
  if (!origin) return response
  let hostname = ''
  try {
    hostname = new URL(origin).hostname
  } catch {
    return response
  }
  const allowed = new Set(['localhost', '127.0.0.1', 'travel-notes.yuanabd.cn', '106.55.2.197'])
  if (hostname && allowed.has(hostname)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Vary', 'Origin')
  }
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
 * CSRF 防护：非 GET/HEAD/OPTIONS 请求校验 Origin 与 Host 一致。
 * - 无 Origin 的请求（curl/服务器间调用/移动端）放行；SameSite=Lax 已阻止跨站带 Cookie。
 * - 跨站浏览器请求 Origin 与 Host 不一致时拒绝。
 */
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

function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null
  }
  const origin = request.headers.get('origin')
  // 微信/部分 WebView 可能发送字符串 'null'，这类请求没有可校验的 Origin，交给 SameSite Cookie 兜底
  if (!origin || origin === 'null') return null

  let originHostname: string
  try {
    originHostname = new URL(origin).hostname
  } catch {
    // 无法解析的 Origin 不拦截，避免误伤正常登录
    return null
  }

  if (!allowedOriginHostnames(request).has(originHostname)) {
    return applySecurityHeaders(NextResponse.json({ error: '跨站请求被拒绝' }, { status: 403 }))
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // CORS 预检（移动端本地壳跨域访问服务器 API）
  if (request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 })
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.headers.set('Access-Control-Max-Age', '86400')
    return applyCorsHeaders(res, request)
  }

  const csrfResponse = rejectCrossOrigin(request)
  if (csrfResponse) return applyCorsHeaders(csrfResponse, request)

  // 首页及公开前缀路径直接放行（首页需精确匹配，不能用 startsWith('/')）
  if (isPublicPath(pathname)) {
    let res = finalizeResponse(NextResponse.next(), request)
    if (pathname === '/uploads' || pathname.startsWith('/uploads/')) res = applyStaticCacheHeaders(res, pathname)
    return res
  }

  const adminSession = request.cookies.get('admin_session')

  if (!adminSession || !adminSession.value) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)', '/uploads/:path*'],
}
