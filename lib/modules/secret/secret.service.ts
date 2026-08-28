/**
 * 应用敏感配置服务：从 DB(AppSecret 表)读取/写入加密后的敏感值（如 DASHSCOPE_API_KEY）。
 * 读取时解密后仅在服务端内存使用，永不写入日志或经响应返回。
 */
import { prisma } from '../../db'
import { encryptSecret, decryptSecret } from '../../infrastructure/secret-crypto'

export async function getSecret(name: string): Promise<string | null> {
  const row = await prisma.appSecret.findUnique({ where: { name } })
  if (!row) return null
  return decryptSecret(row.valueEnc, row.iv)
}

export async function setSecret(name: string, plain: string): Promise<boolean> {
  const enc = encryptSecret(plain)
  if (!enc) return false
  await prisma.appSecret.upsert({
    where: { name },
    create: { name, valueEnc: enc.valueEnc, iv: enc.iv },
    update: { valueEnc: enc.valueEnc, iv: enc.iv },
  })
  return true
}

export async function hasSecret(name: string): Promise<boolean> {
  const row = await prisma.appSecret.findUnique({ where: { name }, select: { id: true } })
  return Boolean(row)
}
