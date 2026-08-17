import { prisma } from '../db'

export interface SessionRecord {
  id: string
  username: string
  expiresAt: Date
  createdAt: Date
  lastUsedAt: Date
  userAgent: string | null
  ipHash: string | null
  revokedAt: Date | null
}

export interface CreateSessionInput {
  id: string
  username: string
  userId?: number | null
  expiresAt: Date
  userAgent?: string | null
  ipHash?: string | null
}

/**
 * Database-backed Session Repository。
 * Session 是登录状态的唯一可信来源：JWT 仅作为携带 sid 的签名凭证，
 * 撤销/过期以数据库记录为准，支持服务重启后仍然生效。
 */
export class PrismaSessionRepository {
  /** 每个用户最多允许的活跃会话数，超出后撤销最早的会话 */
  private readonly maxSessionsPerUser = 8

  private cleanupCounter = 0

  async create(input: CreateSessionInput): Promise<void> {
    // 每 20 次登录清理一次过期会话，避免表无限膨胀
    this.cleanupCounter += 1
    if (this.cleanupCounter % 20 === 0) {
      this.deleteExpired().catch(() => {})
    }

    await prisma.session.create({
      data: {
        id: input.id,
        username: input.username,
        userId: input.userId ?? null,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
        ipHash: input.ipHash ?? null,
      },
    })

    // 清理该用户的超量会话（保留最新的 maxSessionsPerUser 个）
    const active = await prisma.session.findMany({
      where: {
        username: input.username,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      take: this.maxSessionsPerUser + 1,
    })
    if (active.length > this.maxSessionsPerUser) {
      const excessIds = active.slice(this.maxSessionsPerUser).map((s) => s.id)
      await prisma.session.updateMany({
        where: { id: { in: excessIds } },
        data: { revokedAt: new Date() },
      })
    }
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = await prisma.session.findUnique({ where: { id } })
    if (!row) return null
    return {
      id: row.id,
      username: row.username,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      userAgent: row.userAgent,
      ipHash: row.ipHash,
      revokedAt: row.revokedAt,
    }
  }

  /** 节流更新 lastUsedAt，避免每次请求都写库 */
  async touchLastUsed(id: string, now: Date = new Date()): Promise<void> {
    const row = await prisma.session.findUnique({
      where: { id },
      select: { lastUsedAt: true },
    })
    if (!row) return
    const THROTTLE_MS = 5 * 60 * 1000
    if (now.getTime() - row.lastUsedAt.getTime() < THROTTLE_MS) return
    await prisma.session.update({
      where: { id },
      data: { lastUsedAt: now },
    })
  }

  async revoke(id: string): Promise<void> {
    await prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async revokeAllForUser(username: string, exceptId?: string): Promise<void> {
    await prisma.session.updateMany({
      where: {
        username,
        revokedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { revokedAt: new Date() },
    })
  }

  async deleteExpired(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return result.count
  }
}

export const prismaSessionRepository = new PrismaSessionRepository()
