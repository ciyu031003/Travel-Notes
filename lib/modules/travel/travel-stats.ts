import { prisma } from '../../db'
import { findProvinceByLocation } from '../../province-map'
import { absoluteMediaUrl, storageKeyToUrl } from '../../media-url'

/**
 * 统计口径（**唯一事实源**）。
 *
 * 为什么单独抽出来：`/api/me` 与 `/api/dashboard` 各写了一份统计，而且读的是**不同的表** ——
 *  /api/me 读 `Travel`，/api/dashboard 读 `Post(type='travel')`（旧文章模型）。
 * 结果是同一批旅行在两个页面上数字不一样，"我的"显示 0 而看板显示 4。
 *
 * 现在的规则（两处共用这一份）：
 *  1. `Travel.ownerId = 我` 的旅行为主口径（App 里「+ 新建旅行」写的就是它）；
 *  2. **当我没有 Travel 但名下有旧文章时**，用旧文章兜底 —— 存量单管理员时期的数据
 *     是从后台发的文章，不能让用户看到一片 0；
 *  3. 目的地按 `location` 去重（拍板口径：城市）。
 *
 * ⚠️ 任何"统计旅行数/地方数/照片数"的新页面都必须调这里，不要再自己写 where。
 */

export interface TravelStatSource {
  /** 主口径来源：我名下的 Travel 行数 */
  travelRows: number
  /** 兜底来源：我名下已发布的旧文章数 */
  legacyPosts: number
  /** 实际采用的来源 */
  used: 'travel' | 'legacy'
}

export interface TravelArchiveStats {
  travelCount: number
  placeCount: number
  photoCount: number
  /** 有起止日期的旅行累计天数；无日期数据时为 null */
  travelDays: number | null
  provinceCount: number
  /** 数据来自哪张表（排查用；也便于前端在兜底态给一句说明） */
  source: TravelStatSource
}

/** 单条 media → 缩略图优先、回退原图 */
function thumbOf(m: any): string | null {
  const variants = Array.isArray(m?.variants) ? m.variants : []
  const thumb = variants.find((v: any) => v.variant === 'THUMBNAIL') ?? variants[0]
  return storageKeyToUrl(thumb?.storageKey ?? m?.storageKey ?? null)
}

/** 两个日期相差的整天数（b - a） */
export function diffInDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** 一本旅行涉及的照片 URL（封面 + 所有回忆的主图与关联图，去重） */
export function travelPhotoUrls(t: any): string[] {
  const out = new Set<string>()
  const cover = thumbOf(t.coverMedia) ?? absoluteMediaUrl(t.cover ?? null)
  if (cover) out.add(cover)
  for (const day of t.days || []) {
    for (const mem of day.memories || []) {
      for (const m of mem.media || []) {
        const u = thumbOf(m)
        if (u) out.add(u)
      }
      for (const link of mem.mediaLinks || []) {
        const u = thumbOf(link?.media)
        if (u) out.add(u)
      }
    }
  }
  return Array.from(out)
}

/** 我名下旅行（含封面变体、按天回忆照片）——/api/me 与统计共用同一份查询 */
export async function loadMyTravels(userId: number) {
  return prisma.travel.findMany({
    where: { ownerId: userId } as any,
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      title: true,
      slug: true,
      location: true,
      startDate: true,
      endDate: true,
      status: true,
      cover: true,
      companions: true,
      coverMedia: {
        select: {
          storageKey: true,
          variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } },
        },
      },
      days: {
        select: {
          memories: {
            select: {
              media: {
                select: {
                  id: true,
                  storageKey: true,
                  variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } },
                },
              },
              mediaLinks: {
                select: {
                  media: {
                    select: {
                      id: true,
                      storageKey: true,
                      variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
}

/** 旧文章兜底：Post(type='travel', published)，返回与统计同构的最小字段 */
async function loadLegacyTravelPosts(userId: number) {
  return prisma.post.findMany({
    where: { userId, type: 'travel', published: true },
    orderBy: { date: 'desc' },
    select: { id: true, title: true, slug: true, location: true, date: true, cover: true, images: true },
  })
}

function parseImageTokens(images: string | null | undefined): string[] {
  if (!images) return []
  try {
    const parsed = JSON.parse(images)
    return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter(Boolean) : []
  } catch {
    return []
  }
}

function resolveImageToken(token: string): string | null {
  const raw = /^\d+$/.test(token) ? `/api/images/${token}` : token
  return absoluteMediaUrl(raw)
}

/**
 * 计算旅行档案统计。两个数据源都读出来后再决定用哪个 ——
 * 不能只看"Travel 表是否为空"就下结论，还要把旧文章数一起带上（排查时能看到全貌）。
 */
export async function getTravelArchiveStats(userId: number): Promise<TravelArchiveStats> {
  const [travels, legacyPosts] = await Promise.all([
    loadMyTravels(userId).catch(() => [] as Awaited<ReturnType<typeof loadMyTravels>>),
    loadLegacyTravelPosts(userId).catch(() => [] as Awaited<ReturnType<typeof loadLegacyTravelPosts>>),
  ])

  const used: TravelStatSource['used'] = travels.length > 0 ? 'travel' : 'legacy'
  const source: TravelStatSource = { travelRows: travels.length, legacyPosts: legacyPosts.length, used }

  if (used === 'travel') {
    const placeCount = new Set(
      travels.map((t) => t.location?.trim()).filter((v): v is string => !!v),
    ).size

    const allPhotoUrls = new Set<string>()
    for (const t of travels) {
      for (const u of travelPhotoUrls(t)) allPhotoUrls.add(u)
    }

    let travelDays = 0
    let hasDatedTravel = false
    for (const t of travels) {
      if (!t.startDate) continue
      hasDatedTravel = true
      travelDays += Math.max(1, diffInDays(t.startDate, t.endDate ?? t.startDate) + 1)
    }

    const provinceIds = new Set<string>()
    for (const t of travels) {
      if (!t.location) continue
      const p = findProvinceByLocation(t.location)
      if (p) provinceIds.add(p.id)
    }

    return {
      travelCount: travels.length,
      placeCount,
      photoCount: allPhotoUrls.size,
      travelDays: hasDatedTravel ? travelDays : null,
      provinceCount: provinceIds.size,
      source,
    }
  }

  // 兜底：存量旧文章（单管理员时期从后台发的旅行记录）
  const placeSet = new Set(legacyPosts.map((p) => p.location?.trim()).filter((v): v is string => !!v))
  const photoSet = new Set<string>()
  for (const p of legacyPosts) {
    // 封面可能是图片 ID（纯数字）或完整 URL，两种都要能解析
    if (p.cover) {
      const raw = String(p.cover)
      const coverUrl = absoluteMediaUrl(/^\d+$/.test(raw) ? `/api/images/${raw}` : raw)
      if (coverUrl) photoSet.add(coverUrl)
    }
    for (const token of parseImageTokens(p.images)) {
      const u = resolveImageToken(token)
      if (u) photoSet.add(u)
    }
  }
  const provinceIds = new Set<string>()
  for (const p of legacyPosts) {
    if (!p.location) continue
    const prov = findProvinceByLocation(p.location)
    if (prov) provinceIds.add(prov.id)
  }

  return {
    travelCount: legacyPosts.length,
    placeCount: placeSet.size,
    photoCount: photoSet.size,
    travelDays: null,
    provinceCount: provinceIds.size,
    source,
  }
}
