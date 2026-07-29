import { signSession, verifySession } from './auth-utils'
import { getSiteSettings } from './auth'

const ALBUM_COOKIE = 'album_token'

export async function generateAlbumToken(): Promise<string> {
  const settings = await getSiteSettings()
  const date = settings.anniversaryStart
  if (!date) throw new Error('Album not configured')
  return signSession({ date, purpose: 'album', exp: Date.now() + 365 * 24 * 60 * 60 * 1000 })
}

export async function verifyAlbumToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  return verifySession(token)
}

export { ALBUM_COOKIE }
