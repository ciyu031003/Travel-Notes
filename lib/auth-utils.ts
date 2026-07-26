import bcrypt from 'bcryptjs'

const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function signSession(payload: object): Promise<string> {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = await bcrypt.hash(data + SESSION_SECRET, 8)
  const signatureB64 = Buffer.from(signature).toString('base64')
  return `${data}.${signatureB64}`
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    const firstDotIndex = token.indexOf('.')
    if (firstDotIndex === -1) return false

    const data = token.substring(0, firstDotIndex)
    const signatureB64 = token.substring(firstDotIndex + 1)

    const decoded = Buffer.from(data, 'base64').toString('utf-8')
    const payload = JSON.parse(decoded)

    if (payload.exp && payload.exp < Date.now()) return false

    const providedSignature = Buffer.from(signatureB64, 'base64').toString('utf-8')
    const valid = await bcrypt.compare(data + SESSION_SECRET, providedSignature)
    if (!valid) return false

    return true
  } catch {
    return false
  }
}

export function getSessionPayload(token: string) {
  try {
    const firstDotIndex = token.indexOf('.')
    if (firstDotIndex === -1) return null
    const data = token.substring(0, firstDotIndex)
    const decoded = Buffer.from(data, 'base64').toString('utf-8')
    return JSON.parse(decoded) as { username: string; exp: number }
  } catch {
    return null
  }
}
