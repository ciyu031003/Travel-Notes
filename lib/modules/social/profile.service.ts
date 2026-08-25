import { prisma } from '../../db'
import { findProvinceByLocation } from '../../province-map'
import { getUserCapabilities, type UserCapabilities } from '../space/permissions'

function iso(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** 解析 Post.images 的 JSON 文本，返回图片标识数组（数字 ID 或 URL 字符串） */
function parseImageTokens(images: string | null | undefined): string[] {
  if (!images) return []
  try {
    const parsed = JSON.parse(images)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item: unknown) => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

/** 将图片标识（数字 ID / URL）统一解析为可访问 URL，用于去重与展示 */
function resolveImageUrl(value: string | number | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === 'number') return `/api/images/${value}`
  const str = String(value).trim()
  if (!str) return null
  return /^\d+$/.test(str) ? `/api/images/${str}` : str
}

/** 单篇旅行记录的照片数（cover + images 去重） */
function countTravelPhotos(cover: string | null, images: string | null): number {
  const urls = new Set<string>()
  const coverUrl = resolveImageUrl(cover)
  if (coverUrl) urls.add(coverUrl)
  for (const token of parseImageTokens(images)) {
    const u = resolveImageUrl(token)
    if (u) urls.add(u)
  }
  return urls.size
}

export interface TravelProfileSummary {
  travelCount: number
  placeCount: number
  photoCount: number
  /** Post 无可靠天数来源，固定为 null，前端隐藏 Days */
  travelDays: number | null
  momentCount: number
  favoriteCount: number
  likeCount: number
  provinceCount: number
}

export interface RecentTravelSummary {
  id: number
  title: string
  slug: string
  location: string | null
  date: string | null
  coverUrl: string | null
  photoCount: number
}

/** 同行者聚合：「和 X 去过 N 次」 */
export interface CompanionStat {
  name: string
  relation: string | null
  count: number
}

export interface MeProfile {
  id: number
  username: string
  nickname: string | null
  bio: string | null
  avatarUrl: string | null
  accountId: string | null
  createdAt: string | null
  summary: TravelProfileSummary
  recentTravel: RecentTravelSummary | null
  /** 同行者聚合（从 Travel.companions 汇总，按姓名去重计数，最多 8 人） */
  companionStats: CompanionStat[]
  capabilities: UserCapabilities
}

/**
 * 个人旅行档案统一数据源：
 * 旅行记录 = Post(type='travel', published=true)，仅统计当前用户自己（owner），
 * 不再混用 Travel / TravelDay / Media / dashboard 等多套口径。
 */
export async function getMyProfile(userId: number): Promise<MeProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      nickname: true,
      bio: true,
      avatarUrl: true,
      accountId: true,
      createdAt: true,
    },
  })
  if (!user) return null

  const travels = await prisma.post.findMany({
    where: { userId, type: 'travel', published: true },
    orderBy: { date: 'desc' },
    select: { id: true, slug: true, title: true, location: true, date: true, cover: true, images: true },
  })

  const travelCount = travels.length

  const placeCount = new Set(
    travels.map((t) => t.location?.trim()).filter((v): v is string => !!v)
  ).size

  // 全部照片（cover + images，按解析后 URL 去重）
  const allPhotoUrls = new Set<string>()
  for (const t of travels) {
    const coverUrl = resolveImageUrl(t.cover)
    if (coverUrl) allPhotoUrls.add(coverUrl)
    for (const token of parseImageTokens(t.images)) {
      const u = resolveImageUrl(token)
      if (u) allPhotoUrls.add(u)
    }
  }
  const photoCount = allPhotoUrls.size

  const provinceIds = new Set<string>()
  for (const t of travels) {
    if (!t.location) continue
    const p = findProvinceByLocation(t.location)
    if (p) provinceIds.add(p.id)
  }
  const provinceCount = provinceIds.size

  const [momentCount, favoriteCount, likeAgg] = await Promise.all([
    prisma.moment.count({ where: { userId } }),
    prisma.postFavorite.count({ where: { userId } }),
    prisma.travelPost.aggregate({
      where: { authorId: userId, visibility: 'PUBLIC' },
      _sum: { likeCount: true },
    }),
  ])
  const likeCount = likeAgg._sum.likeCount ?? 0

  const capabilities = await getUserCapabilities(userId)

  const latest = travels[0] ?? null
  const recentTravel: RecentTravelSummary | null = latest
    ? {
        id: latest.id,
        title: latest.title,
        slug: latest.slug,
        location: latest.location,
        date: iso(latest.date),
        coverUrl:
          resolveImageUrl(latest.cover) ??
          (parseImageTokens(latest.images).map(resolveImageUrl).find(Boolean) ?? null),
        photoCount: countTravelPhotos(latest.cover, latest.images),
      }
    : null

  // 同行者聚合：我的旅行（ownerId 归属，或所在 ACTIVE 空间的旅行）里 companions 按姓名计数
  const memberSpaces = await prisma.spaceMember.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { spaceId: true },
  })
  const spaceIds = memberSpaces.map((s) => s.spaceId)
  const companionTravels = await prisma.travel.findMany({
    where: {
      OR: [
        { ownerId: userId },
        ...(spaceIds.length > 0 ? [{ spaceId: { in: spaceIds } }] : []),
      ],
    },
    select: { id: true, companions: true },
  })
  const seenTravelIds = new Set<number>()
  const byName = new Map<string, CompanionStat>()
  for (const t of companionTravels) {
    if (seenTravelIds.has(t.id)) continue
    seenTravelIds.add(t.id)
    if (!Array.isArray(t.companions)) continue
    for (const c of t.companions as Array<{ name?: unknown; relation?: unknown }>) {
      const name = String(c?.name || '').trim()
      if (!name) continue
      const relation = String(c?.relation || '').trim() || null
      const cur = byName.get(name)
      if (cur) {
        cur.count += 1
        if (!cur.relation && relation) cur.relation = relation
      } else {
        byName.set(name, { name, relation, count: 1 })
      }
    }
  }
  const companionStats = Array.from(byName.values()).sort((a, b) => b.count - a.count).slice(0, 8)

  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    accountId: user.accountId,
    createdAt: iso(user.createdAt),
    summary: {
      travelCount,
      placeCount,
      photoCount,
      travelDays: null,
      momentCount,
      favoriteCount,
      likeCount,
      provinceCount,
    },
    recentTravel,
    companionStats,
    capabilities,
  }
}

function normalizeNickname(nickname: unknown): string | null {
  if (nickname == null) return null
  const value = String(nickname).trim()
  if (!value) return null
  return value.slice(0, 24)
}

function normalizeBio(bio: unknown): string | null {
  if (bio == null) return null
  const value = String(bio).trim()
  if (!value) return null
  return value.slice(0, 120)
}

export async function updateMyProfile(
  userId: number,
  input: { nickname?: unknown; bio?: unknown }
): Promise<{ nickname: string | null; bio: string | null }> {
  const data: { nickname?: string | null; bio?: string | null } = {}

  if (Object.prototype.hasOwnProperty.call(input, 'nickname')) {
    const next = normalizeNickname(input.nickname)
    if (next && !/^[\u4e00-\u9fa5A-Za-z0-9_\-\s]{1,24}$/.test(next)) {
      throw new Error('昵称仅支持 1-24 位中文/字母/数字/空格/下划线/短横线')
    }
    data.nickname = next
  }

  if (Object.prototype.hasOwnProperty.call(input, 'bio')) {
    const bio = normalizeBio(input.bio)
    if (bio && bio.length > 120) {
      throw new Error('个性签名最多 120 字')
    }
    data.bio = bio
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('用户不存在')

  const updated = await prisma.user.update({ where: { id: userId }, data })
  return { nickname: updated.nickname, bio: updated.bio }
}

export async function updateMyAvatar(userId: number, avatarUrl: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('用户不存在')
  const updated = await prisma.user.update({ where: { id: userId }, data: { avatarUrl } })
  return { avatarUrl: updated.avatarUrl }
}
