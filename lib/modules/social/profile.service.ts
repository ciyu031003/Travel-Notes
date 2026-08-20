import { prisma } from '../../db'
import { getDashboardStats } from '../../services/dashboard.service'

function iso(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export async function getMyProfile(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarUrl: true,
      accountId: true,
      email: true,
      emailVerified: true,
      anniversaryStart: true,
      createdAt: true,
    },
  })
  if (!user) return null

  const [
    postCount,
    followerCount,
    followingCount,
    favoriteCount,
    tripCount,
    dayCount,
    photoCount,
    momentCount,
    travels,
  ] = await Promise.all([
    prisma.travelPost.count({ where: { authorId: userId, visibility: 'PUBLIC' } }),
    prisma.userFollow.count({ where: { followingId: userId } }),
    prisma.userFollow.count({ where: { followerId: userId } }),
    prisma.postFavorite.count({ where: { userId } }),
    prisma.travel.count({ where: { ownerId: userId } }),
    prisma.travelDay.count({ where: { travel: { ownerId: userId } } }),
    prisma.media.count({ where: { userId, type: 'IMAGE' } }),
    prisma.moment.count({ where: { userId } }),
    prisma.travel.findMany({ where: { ownerId: userId }, select: { location: true } }),
  ])

  const placeCount = new Set(travels.map((t) => t.location).filter((v): v is string => !!v?.trim())).size

  const recentTravel = await prisma.travel.findFirst({
    where: { ownerId: userId },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      title: true,
      slug: true,
      location: true,
      startDate: true,
      endDate: true,
      coverMedia: { select: { storageKey: true } },
      cover: true,
    },
  })

  function mediaUrl(storageKey: string): string {
    if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
      const base = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')
      return base + '/' + storageKey
    }
    return '/uploads/' + storageKey
  }

  const coverUrl = recentTravel
    ? recentTravel.coverMedia?.storageKey
      ? mediaUrl(recentTravel.coverMedia.storageKey)
      : recentTravel.cover
    : null

  const dashboard = await getDashboardStats(userId).catch(() => null)

  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    accountId: user.accountId,
    email: user.email,
    emailVerified: user.emailVerified,
    anniversaryStart: user.anniversaryStart,
    createdAt: iso(user.createdAt),
    stats: { postCount, followerCount, followingCount, favoriteCount, tripCount, placeCount, photoCount, dayCount, momentCount },
    dashboard,
    recentTravel: recentTravel
      ? {
          id: recentTravel.id,
          title: recentTravel.title,
          slug: recentTravel.slug,
          location: recentTravel.location,
          startDate: iso(recentTravel.startDate),
          endDate: iso(recentTravel.endDate),
          coverUrl,
        }
      : null,
  }
}

function normalizeNickname(nickname: unknown): string | null {
  if (nickname == null) return null
  const value = String(nickname).trim()
  if (!value) return null
  return value.slice(0, 24)
}

export async function updateMyNickname(userId: number, nickname: unknown) {
  const next = normalizeNickname(nickname)
  if (next && !/^[\u4e00-\u9fa5A-Za-z0-9_\-\s]{1,24}$/.test(next)) {
    throw new Error('昵称仅支持 1-24 位中文/字母/数字/空格/下划线/短横线')
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('用户不存在')
  const updated = await prisma.user.update({ where: { id: userId }, data: { nickname: next } })
  return { nickname: updated.nickname }
}

export async function updateMyAvatar(userId: number, avatarUrl: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('用户不存在')
  const updated = await prisma.user.update({ where: { id: userId }, data: { avatarUrl } })
  return { avatarUrl: updated.avatarUrl }
}
