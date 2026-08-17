import { signSession, verifySession } from './auth-utils'

const ALBUM_COOKIE = 'album_token'

/**
 * 用已通过验证的纪念日日期签名相册令牌（不再依赖"第一个用户"的纪念日，
 * 多用户下各自设置的纪念日均可解锁）。
 */
export async function generateAlbumToken(date: string): Promise<string> {
  if (!date) throw new Error('Album not configured')
  return signSession({ date, purpose: 'album', exp: Date.now() + 365 * 24 * 60 * 60 * 1000 })
}

export async function verifyAlbumToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  return verifySession(token)
}

export function extractAlbumToken(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie') || ''
  const tokenMatch = cookieHeader.match(new RegExp(ALBUM_COOKIE + '=([^;]+)'))
  return tokenMatch ? decodeURIComponent(tokenMatch[1]) : undefined
}
export { ALBUM_COOKIE }
