import { prisma } from '../db'

export interface TokenBlacklistRepository {
  add(jti: string, expiresAt: Date): Promise<void>
  isBlacklisted(jti: string): Promise<boolean>
}

export class PrismaTokenBlacklistRepository implements TokenBlacklistRepository {
  async add(jti: string, expiresAt: Date): Promise<void> {
    try {
      await prisma.tokenBlacklist.upsert({
        where: { jti },
        update: { expiresAt },
        create: { jti, expiresAt },
      })
    } catch (error) {
      console.error('[PrismaTokenBlacklistRepository.add] failed:', (error as Error)?.message)
    }
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      const row = await prisma.tokenBlacklist.findUnique({ where: { jti } })
      if (!row) return false
      if (row.expiresAt.getTime() < Date.now()) {
        // 过期记录惰性清理
        await prisma.tokenBlacklist.delete({ where: { jti } }).catch(() => {})
        return false
      }
      return true
    } catch (error) {
      console.error('[PrismaTokenBlacklistRepository.isBlacklisted] failed:', (error as Error)?.message)
      return false
    }
  }
}

export const prismaTokenBlacklistRepository = new PrismaTokenBlacklistRepository()
