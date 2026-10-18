/**
 * 站点主人显式化（P0-3）。
 *
 * 为什么需要这个文件：旧权限模型用「没有任何 Space 成员身份 = 单用户 = OWNER」反推站长，
 * 而 /api/register 是公开的 —— 新注册用户天然没有任何空间成员身份，于是被判成 OWNER，
 * 可读全站审计、治理他人内容、改站点设置（评审 S-3 / A-1，账号接管链之一）。
 *
 * 现在站长身份是**数据库里的显式字段** User.siteRole = 'SITE_OWNER'，其它人一律 'USER'。
 * 首个主人的确定方式：若库里还没有 SITE_OWNER，把 id 最小的用户提升上去（幂等、并发安全）。
 */
import { prisma } from './db'
import { skipDbOnBuild } from './db-guard'

export const SITE_OWNER_ROLE = 'SITE_OWNER'
export const USER_ROLE = 'USER'

const CACHE_TTL_MS = 60_000

let cachedOwnerId: number | null = null
let cacheExpiresAt = 0

/** 用户/角色变更后调用，让缓存立刻失效（测试与运维脚本也用） */
export function invalidateSiteOwnerCache(): void {
  cachedOwnerId = null
  cacheExpiresAt = 0
}

/**
 * 确保库里有一个 SITE_OWNER：没有则把 id 最小的用户提升为主人。
 *
 * 幂等 & 并发安全：用 updateMany + `siteRole != SITE_OWNER` 条件做 CAS 式更新，
 * 多个进程同时调用也只会产生一个主人（第二次更新命中 0 行）。
 * 构建期（SKIP_DB_ON_BUILD）与数据库异常一律返回 null 且**不抛错** ——
 * 调用方按「不是主人」处理（fail-closed 到普通 USER）。
 */
export async function ensureSiteOwnerRole(): Promise<number | null> {
  if (skipDbOnBuild()) return null
  try {
    const existing = await prisma.user.findFirst({
      where: { siteRole: SITE_OWNER_ROLE },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (existing) return existing.id

    // 空库：没有可提升的用户（初始化尚未完成）
    const first = await prisma.user.findFirst({ orderBy: { id: 'asc' }, select: { id: true } })
    if (!first) return null

    await prisma.user.updateMany({
      where: { id: first.id, siteRole: { not: SITE_OWNER_ROLE } },
      data: { siteRole: SITE_OWNER_ROLE },
    })

    // 并发下可能已被别的进程提升，重新确认最终主人（保证全库唯一）
    const owner = await prisma.user.findFirst({
      where: { siteRole: SITE_OWNER_ROLE },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    const ownerId = owner?.id ?? first.id
    cachedOwnerId = ownerId
    cacheExpiresAt = Date.now() + CACHE_TTL_MS
    return ownerId
  } catch (error) {
    console.error('[site-owner] ensureSiteOwnerRole 失败（按无主人处理）:', (error as Error)?.message || error)
    return null
  }
}

/**
 * 取站点主人 id（模块级缓存 60s，避免每个能力检查都打库）。
 * 没提升过主人时顺带触发 ensureSiteOwnerRole。
 */
export async function getSiteOwnerId(): Promise<number | null> {
  if (skipDbOnBuild()) return null
  if (cachedOwnerId !== null && Date.now() < cacheExpiresAt) return cachedOwnerId
  try {
    const owner = await prisma.user.findFirst({
      where: { siteRole: SITE_OWNER_ROLE },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (owner) {
      cachedOwnerId = owner.id
      cacheExpiresAt = Date.now() + CACHE_TTL_MS
      return owner.id
    }
  } catch (error) {
    console.error('[site-owner] 查询站点主人失败（按无主人处理）:', (error as Error)?.message || error)
    return null
  }
  return ensureSiteOwnerRole()
}

/** 是否站点主人；userId 为空 / 构建期 / DB 异常一律 false（fail-closed） */
export async function isSiteOwner(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false
  const ownerId = await getSiteOwnerId()
  return ownerId !== null && ownerId === userId
}
