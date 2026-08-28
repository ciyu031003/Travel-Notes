/**
 * 敏感配置加解密：AES-256-GCM。
 * 加密密钥来自环境变量 APP_ENCRYPTION_KEY（服务器 .env，不落代码）。
 * 落库形式：明文 = { valueEnc, iv }（iv 为 12 字节随机, base64；valueEnc 为密文+GCM tag, base64）。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function encKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) return null
  // 允许任意长度密钥，统一 SHA-256 归一为 32 字节（AES-256）
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plain: string): { valueEnc: string; iv: string } | null {
  const key = encKey()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // 密文 + GCM tag 合并存储
  return {
    valueEnc: Buffer.concat([enc, tag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decryptSecret(valueEnc: string, ivB64: string): string | null {
  const key = encKey()
  if (!key) return null
  try {
    const iv = Buffer.from(ivB64, 'base64')
    const data = Buffer.from(valueEnc, 'base64')
    const tag = data.subarray(data.length - 16)
    const enc = data.subarray(0, data.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** 是否已配置加密密钥（未配置则视为禁用敏感配置能力） */
export function isSecretEncryptionConfigured(): boolean {
  return Boolean(process.env.APP_ENCRYPTION_KEY)
}
