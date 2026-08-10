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
  '/travel',
  '/notes',
  '/search',
  '/api/login',
  '/api/check-auth',
  '/api/logout',
  '/api/album',
  '/api/images',
  '/api/verify-album-password',
  '/api/admin/login',
  '/api/admin/check',
  '/api/admin/logout',
  '/api/admin/settings',
  '/api/admin/force-change-password',
  '/api/forgot-password',
  '/api/notes',
  '/api/danmaku',
  '/api/repos',
  '/api/search',
  '/api/tags',
  '/api/blog',
  '/api/stats',
  '/uploads',
  '/_next',
]

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 首页及公开前缀路径直接放行（首页需精确匹配，不能用 startsWith('/')）
  if (pathname === '/' || PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const adminSession = request.cookies.get('admin_session')

  if (!adminSession || !adminSession.value) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const isValid = await verifyJWT(adminSession.value)
  if (!isValid) {
    const response = NextResponse.next()
    response.cookies.set('admin_session', '', { maxAge: 0, path: '/' })
    
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
