import { prisma } from '../../db'
import { getUserCapabilities, type UserCapabilities } from '../space/permissions'
import { invalidateCurrentUserCache } from '../../current-user'
import { absoluteMediaUrl, storageKeyToUrl } from '../../media-url'
import {
  diffInDays,
  getTravelArchiveStats,
  loadMyTravels,
  travelPhotoUrls,
  type TravelStatSource,
} from '../travel/travel-stats'

/**
 * 个人旅行档案统一数据源（R1 重构 / R3 统一口径）。
 *
 * ⚠️ 统计口径（travelCount / placeCount / photoCount）**不再在这里计算**，
 * 而是走 `lib/modules/travel/travel-stats.ts` —— 那是 `/api/me` 与 `/api/dashboard`
 * 共用的唯一事实源。原因：两处曾经各写一份、读不同的表（Travel vs Post），
 * 于是"我的"显示 0、看板显示 4（真机反馈"统计都是 0"的根因之一）。
 */

function iso(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export interface TravelProfileSummary {
  travelCount: number
  /** 城市去重口径（拍板结论）：`Travel.location` 去重数 */
  placeCount: number
  photoCount: number
  /** 可按天数据算出的总天数；无天数据时为 null（前端隐藏） */
  travelDays: number | null
  momentCount: number
  favoriteCount: number
  likeCount: number
  provinceCount: number
  /** 统计来自哪张表（Travel 为主、旧文章兜底）——便于排查"数字不对" */
  source: TravelStatSource
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

/** 下一趟未出发的旅行（「我的」页与空间页共用） */
export interface UpcomingTravelSummary {
  id: number
  title: string
  slug: string
  location: string | null
  startDate: string | null
  /** 距离出发还有几天（今天出发为 0） */
  daysUntilStart: number
  coverUrl: string | null
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
  /** 档案头图（用户上传的风景图） */
  coverUrl: string | null
  /** 头图焦点 0-1；渲染为 object-position。null = 居中 */
  coverFocusX: number | null
  coverFocusY: number | null
  accountId: string | null
  createdAt: string | null
  summary: TravelProfileSummary
  recentTravel: RecentTravelSummary | null
  upcomingTravel: UpcomingTravelSummary | null
  /** 同行者聚合（从 Travel.companions 汇总，按姓名去重计数，最多 8 人） */
  companionStats: CompanionStat[]
  capabilities: UserCapabilities
  /** 新用户偏好问卷答案（未做过为 null） */
  preferences: unknown
  /** 问卷完成或跳过的时刻；null 表示还没做过 → 客户端弹问卷 */
  preferencesCompletedAt: string | null
}

/** 一天中的零点（本地时区），用于「距离出发还有几天」 */
function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

// diffInDays 从 travel-stats 复用（原先本文件也有一份，两处实现重复）
export { diffInDays }

/** 单条 media → 缩略图优先、回退原图（与 travel.service 的 thumbOf 同口径） */
function thumbOf(m: any): string | null {
  const variants = Array.isArray(m?.variants) ? m.variants : []
  // 用 find 而不是 [0]：variants 数组的顺序不保证（曾因此拿到原图而非缩略图）
  const thumb = variants.find((v: any) => v.variant === 'THUMBNAIL') ?? variants[0]
  return storageKeyToUrl(thumb?.storageKey ?? m?.storageKey ?? null)
}

export async function getMyProfile(userId: number): Promise<MeProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      nickname: true,
      bio: true,
      avatarUrl: true,
      coverUrl: true,
      coverFocusX: true,
      coverFocusY: true,
      accountId: true,
      // 新用户偏好问卷：客户端据此决定是否弹（见 lib/modules/user/preferences.ts）
      preferences: true,
      preferencesCompletedAt: true,
      createdAt: true,
    },
  })
  if (!user) return null

  const travels = await loadMyTravels(userId)

  // 统计走唯一事实源（与 /api/dashboard 同源；无 Travel 时用旧文章兜底）
  const stats = await getTravelArchiveStats(userId)

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

  const today = startOfToday()
  // 已结束的旅行（有结束日且早于今天）不进「最近的一次旅行」——
  // 否则用户改完旧旅行日期，首页/档案最显眼的位置会显示一段过去的行程。
  const finished = (t: { startDate: Date | null; endDate: Date | null }) => {
    const end = t.endDate ?? t.startDate
    return !!end && diffInDays(today, end) < 0
  }
  const byStartDesc = [...travels].sort((a, b) => {
    const av = a.startDate ? a.startDate.getTime() : 0
    const bv = b.startDate ? b.startDate.getTime() : 0
    return bv - av || b.id - a.id
  })
  const latest = byStartDesc.find((t) => !finished(t)) ?? byStartDesc[0] ?? null

  const recentTravel: RecentTravelSummary | null = latest
    ? {
        id: latest.id,
        title: latest.title,
        slug: latest.slug,
        location: latest.location,
        date: iso(latest.startDate),
        coverUrl: thumbOf(latest.coverMedia) ?? absoluteMediaUrl(latest.cover ?? null),
        photoCount: travelPhotoUrls(latest).length,
      }
    : null

  // 下一趟：开始日 >= 今天，取最近的一本
  const upcoming = byStartDesc
    .filter((t) => t.startDate && diffInDays(today, t.startDate) >= 0)
    .sort((a, b) => (a.startDate!.getTime() - b.startDate!.getTime()))
  const upcomingTravel: UpcomingTravelSummary | null = upcoming[0]
    ? {
        id: upcoming[0].id,
        title: upcoming[0].title,
        slug: upcoming[0].slug,
        location: upcoming[0].location,
        startDate: iso(upcoming[0].startDate),
        daysUntilStart: diffInDays(today, upcoming[0].startDate!),
        coverUrl: thumbOf(upcoming[0].coverMedia) ?? absoluteMediaUrl(upcoming[0].cover ?? null),
      }
    : null

  // 同行者聚合：从 Travel.companions 汇总（自己名下的旅行）
  const byName = new Map<string, CompanionStat>()
  for (const t of travels) {
    const companions = t.companions
    if (!Array.isArray(companions)) continue
    for (const c of companions as Array<{ name?: unknown; relation?: unknown }>) {
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
    avatarUrl: absoluteMediaUrl(user.avatarUrl),
    coverUrl: absoluteMediaUrl(user.coverUrl),
    coverFocusX: user.coverFocusX ?? null,
    coverFocusY: user.coverFocusY ?? null,
    accountId: user.accountId,
    createdAt: iso(user.createdAt),
    summary: {
      travelCount: stats.travelCount,
      placeCount: stats.placeCount,
      photoCount: stats.photoCount,
      travelDays: stats.travelDays,
      momentCount,
      favoriteCount,
      likeCount,
      provinceCount: stats.provinceCount,
      source: stats.source,
    },
    recentTravel,
    upcomingTravel,
    companionStats,
    capabilities,
    preferences: user.preferences ?? null,
    preferencesCompletedAt: iso(user.preferencesCompletedAt),
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
  input: { nickname?: unknown; bio?: unknown },
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
  invalidateCurrentUserCache(userId)
  return { nickname: updated.nickname, bio: updated.bio }
}

export async function updateMyAvatar(userId: number, avatarUrl: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('用户不存在')
  const updated = await prisma.user.update({ where: { id: userId }, data: { avatarUrl } })
  invalidateCurrentUserCache(userId)
  return { avatarUrl: absoluteMediaUrl(updated.avatarUrl) }
}

/** 保存档案头图与焦点（焦点为 0-1 的归一化坐标，null 表示居中） */
export async function updateMyCover(
  userId: number,
  coverUrl: string,
  focus?: { x: number | null; y: number | null },
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('用户不存在')
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      coverUrl,
      coverFocusX: focus?.x ?? null,
      coverFocusY: focus?.y ?? null,
    },
  })
  invalidateCurrentUserCache(userId)
  return {
    coverUrl: absoluteMediaUrl(updated.coverUrl),
    coverFocusX: updated.coverFocusX ?? null,
    coverFocusY: updated.coverFocusY ?? null,
  }
}

/** 只更新焦点（不重传图片）—— 用户重选「画面重点在哪」时调用 */
export async function updateMyCoverFocus(
  userId: number,
  focus: { x: number | null; y: number | null },
) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { coverFocusX: focus.x, coverFocusY: focus.y },
  })
  invalidateCurrentUserCache(userId)
  return {
    coverUrl: absoluteMediaUrl(updated.coverUrl),
    coverFocusX: updated.coverFocusX ?? null,
    coverFocusY: updated.coverFocusY ?? null,
  }
}
