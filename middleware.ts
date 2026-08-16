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
  '/admin/change-password',
  '/forgot-password',
  '/album',
  '/albums',
  '/travel',
  '/timeline',
  '/search',
  '/moments',
  '/dashboard',
  '/api/login',
  '/api/check-auth',
  '/api/logout',
  '/api/album',
  '/api/albums',
  '/api/anniversaries',
  '/api/images',
  '/api/travel',
  '/api/verify-album-password',
  '/api/admin/login',
  '/api/admin/check',
  '/api/admin/logout',
  '/api/admin/setup',
  '/api/admin/settings',
  '/api/admin/force-change-password',
  '/api/forgot-password',
  '/api/moments',
  '/api/likes',
  '/api/photo-messages',
  '/api/danmaku',
  '/api/search',
  '/uploads',
  '/_next',
]

/**
 * 安全响应头（Security Headers）：
 * - CSP：限制脚本/样式/资源来源，阻止外部脚本注入
 * - HSTS：强制 HTTPS（生产环境）
 * - X-Content-Type-Options：禁止 MIME 嗅探
 * - Referrer-Policy / Permissions-Policy / Frame 防护
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  const isProd = process.env.NODE_ENV === 'production'

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
    ...(isProd ? ['upgrade-insecure-requests'] : []),
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
  if (isProd) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }
  return response
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
function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null
  }
  const origin = request.headers.get('origin')
  const host = request.nextUrl.host
  if (!origin || !host) return null
  try {
    if (new URL(origin).host !== host) {
      return applySecurityHeaders(NextResponse.json({ error: '跨站请求被拒绝' }, { status: 403 }))
    }
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: '跨站请求被拒绝' }, { status: 403 }))
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const csrfResponse = rejectCrossOrigin(request)
  if (csrfResponse) return csrfResponse

  // 首页及公开前缀路径直接放行（首页需精确匹配，不能用 startsWith('/')）
  if (pathname === '/' || PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return applySecurityHeaders(NextResponse.next())
  }

  const adminSession = request.cookies.get('admin_session')

  if (!adminSession || !adminSession.value) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return applySecurityHeaders(NextResponse.redirect(loginUrl))
  }

  const isValid = await verifyJWT(adminSession.value)
  if (!isValid) {
    const response = NextResponse.next()
    response.cookies.set('admin_session', '', { maxAge: 0, path: '/' })

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return applySecurityHeaders(NextResponse.redirect(loginUrl))
  }

  return applySecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
