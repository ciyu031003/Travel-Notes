import type { BookPage, BookPhotoRef } from './types'

/**
 * Book Composer —— 把一次旅行的照片/日程编排成一本画册的逻辑页序列。
 *
 * 纯函数：无 DOM、无 IO、无随机、无当前时间依赖 → 可完整单测，
 * 且同一份输入永远产出同一本画册（page-flip 只交付一次页面集合，稳定性是硬要求）。
 *
 * 编排原则（对应方案 §4.3）：
 *  1. **质量 > 数量**：正册只放打分靠前的照片；未入选的进 INDEX 附录页，一张不丢。
 *  2. **书籍节奏**：COVER → OPENING → 每个 DAY（DAY_OPENING → PEAK → PAUSE → ECHO…）
 *     → TIMELINE → ENDING → INDEX。
 *  3. **不为了覆盖全部照片而稀释节奏**：`targetPages` 是硬预算。
 */

/* ------------------------------------------------------------------ */
/* 输入                                                                */
/* ------------------------------------------------------------------ */

export interface ComposerPhoto extends BookPhotoRef {
  /** 被哪些 Memory 引用（有回忆绑定 = 有故事，加分） */
  memoryId?: number | null
}

export interface ComposerChapter {
  /** 1-based 章序号 */
  index: number
  title: string | null
  date: string | null
  summary: string | null
  /** 行程点标题（日程页用） */
  itinerary: { title: string; locationName: string | null }[]
  /** 该章的照片（已按时间升序） */
  photos: ComposerPhoto[]
}

export interface ComposerInput {
  bookKey: string
  title: string
  location: string | null
  startDate: string | null
  endDate: string | null
  chapters: ComposerChapter[]
  coverPhoto?: ComposerPhoto | null
  /** 正册页数预算（默认 40）。超出部分进 INDEX 附录。 */
  targetPages?: number
}

export interface ComposedBook {
  pages: BookPage[]
  /** 未进正册的照片（按时间顺序），供 INDEX 附录与 PhotoViewer 使用 */
  index: ComposerPhoto[]
  /** 正册入选张数 / 全书张数（画册墙统计口径） */
  stats: { selected: number; total: number }
}

/* ------------------------------------------------------------------ */
/* 打分：只用现有字段，无 AI/ML                                          */
/* ------------------------------------------------------------------ */

/** 单张照片的分辨率权重：越接近 3:2 ~ 4:3 越"像张好照片"，极端长条降权 */
function aspectWeight(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 0.35
  const ratio = aspect >= 1 ? aspect : 1 / aspect
  // 1.33(4:3) ~ 1.5(3:2) 满分；1.0(方) 与 ≥2.4(全景长条) 递减
  if (ratio <= 1.5) return Math.max(0.35, 1 - Math.abs(1.4 - ratio) * 1.3)
  return Math.max(0.35, 1 - (ratio - 1.5) * 0.55)
}

function aspectBucket(aspect: number): 'portrait' | 'square' | 'landscape' | 'pano' {
  if (!Number.isFinite(aspect) || aspect <= 0) return 'square'
  if (aspect < 0.95) return 'portrait'
  if (aspect <= 1.08) return 'square'
  if (aspect < 1.9) return 'landscape'
  return 'pano'
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.abs(ta - tb) / 86_400_000
}

/**
 * 单张照片得分（0..1 量级）。
 * 权重刻意写成常量并注释理由，方便后续调参与单测断言。
 */
export function scorePhoto(
  photo: ComposerPhoto,
  ctx: { referenceDate: string | null; bucketCount: Record<string, number>; total: number },
): number {
  // ① 画质（构图/分辨率代理）：权重最高——"质量 > 数量"主要靠这一项
  const quality = aspectWeight(photo.aspect) * 1.0

  // ② 稀有性：该构图方向在本章占比越低越加分，避免整册全是同一种构图
  const bucket = aspectBucket(photo.aspect)
  const share = ctx.total > 0 ? (ctx.bucketCount[bucket] ?? 0) / ctx.total : 1
  const rarity = (1 - share) * 0.45

  // ③ 时间邻近：离当天越近越可能是当天主叙事（无时间信息给中性分）
  const gap = daysBetween(photo.takenAt, ctx.referenceDate)
  const proximity = gap === null ? 0.25 : Math.max(0, 0.5 - gap * 0.12)

  // ④ 有地点（可展示"在哪里"）
  const located = photo.locationName ? 0.2 : 0

  // ⑤ 被 Memory 绑定（有故事可讲）
  const remembered = photo.memoryId ? 0.3 : 0

  return quality + rarity + proximity + located + remembered
}

/**
 * 近重复剔除：
 *  - 同一 URL（Post 封面 == images[0] 这类重复）→ 只留一张；
 *  - 同一「连拍」内的同构图照片 → 只留一张（默认 8 秒窗口；连拍通常 <5s）。
 *
 * 刻意保守：宁可有几张相似照片，也不要误删不同时刻的真实记录。
 * 没有拍摄时间时**不**做时间近似判定（信息不足，删错代价更高）。
 */
export function dedupePhotos(
  photos: ComposerPhoto[],
  burstWindowSeconds = 8,
): ComposerPhoto[] {
  const kept: ComposerPhoto[] = []
  const seenUrls = new Set<string>()
  for (const p of photos) {
    const url = p.fullUrl || p.previewUrl || p.thumbnailUrl || ''
    if (url && seenUrls.has(url)) continue
    const duplicate = kept.some((k) => {
      if (k.takenAt === null || p.takenAt === null) return false
      if (aspectBucket(k.aspect) !== aspectBucket(p.aspect)) return false
      const gap = daysBetween(k.takenAt, p.takenAt)
      return gap !== null && gap * 86_400 <= burstWindowSeconds
    })
    if (duplicate) continue
    if (url) seenUrls.add(url)
    kept.push(p)
  }
  return kept
}

/* ------------------------------------------------------------------ */
/* 编排                                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_TARGET_PAGES = 40

/** 每个 DAY 的页型节奏（对应方案 §4.3 的 PEAK / PAUSE / ECHO） */
interface DayPlan {
  peak: ComposerPhoto | null
  pause: ComposerPhoto | null
  echo: ComposerPhoto[]
  /** 正册里以"单张整页"呈现的照片（含 peak） */
  selected: ComposerPhoto[]
}

function planDay(
  photos: ComposerPhoto[],
  budget: number,
  referenceDate: string | null,
): DayPlan {
  if (photos.length === 0) {
    return { peak: null, pause: null, echo: [], selected: [] }
  }

  const bucketCount: Record<string, number> = {}
  for (const p of photos) {
    const b = aspectBucket(p.aspect)
    bucketCount[b] = (bucketCount[b] ?? 0) + 1
  }
  const ctx = { referenceDate, bucketCount, total: photos.length }
  const ranked = [...photos]
    .map((p) => ({ p, s: scorePhoto(p, ctx) }))
    .sort((a, b) => b.s - a.s || (a.p.takenAt ?? '').localeCompare(b.p.takenAt ?? ''))

  const take = Math.max(0, Math.min(budget, ranked.length))
  const chosen = ranked.slice(0, take).map((r) => r.p)

  return {
    peak: chosen[0] ?? null,
    pause: chosen[1] ?? null,
    echo: chosen.slice(2),
    selected: chosen,
  }
}

/**
 * 编排一本画册。
 *
 * 页面序列：
 *   COVER
 *   OPENING
 *   每章: DAY_OPENING → [FULL_BLEED(peak, 跨页出血)] → [PHOTO_CAPTION(pause)] → PHOTO_CAPTION(echo…)
 *   TIMELINE（≥2 章时）
 *   ENDING
 *   INDEX（有未入选照片时，每页 9 张；双页模式下每页展开为跨页出血）
 */
export function composeBook(input: ComposerInput): ComposedBook {
  const targetPages = input.targetPages ?? DEFAULT_TARGET_PAGES
  const days = [...input.chapters].sort((a, b) => a.index - b.index)

  // 先剔重，再按章分配预算（预算按"有照片的天数"均摊，剩余给先到的天）
  const dedupedDays = days.map((d) => ({
    ...d,
    photos: dedupePhotos(d.photos),
  }))
  const daysWithPhotos = dedupedDays.filter((d) => d.photos.length > 0).length
  const totalPhotos = dedupedDays.reduce((sum, d) => sum + d.photos.length, 0)

  // 固定开销：封面 + 前言 + 时间线(0/1) + 结尾 = 3..4 页
  const fixedPages = 3 + (dedupedDays.length >= 2 ? 1 : 0)
  const budgetForPhotos = Math.max(0, targetPages - fixedPages)
  const perDayBase = daysWithPhotos > 0 ? Math.floor(budgetForPhotos / daysWithPhotos) : 0
  let carry = daysWithPhotos > 0 ? budgetForPhotos - perDayBase * daysWithPhotos : 0

  const pages: BookPage[] = []
  const selectedIds = new Set<number>()

  // ── 封面
  pages.push({
    id: 'cover',
    type: 'COVER',
    dayIndex: null,
    title: input.title,
    subtitle: input.location ?? undefined,
    takenAt: input.startDate ?? undefined,
    photos: input.coverPhoto ? [input.coverPhoto] : [],
  })

  // ── 前言：全书统计 + 行程序言
  const cityCount = new Set(
    dedupedDays.flatMap((d) => d.photos.map((p) => p.locationName).filter(Boolean) as string[]),
  ).size
  pages.push({
    id: 'opening',
    type: 'OPENING',
    dayIndex: null,
    title: input.title,
    subtitle: input.location ?? undefined,
    body: [
      input.startDate ? `${formatDateCn(input.startDate)}${input.endDate && input.endDate !== input.startDate ? ` — ${formatDateCn(input.endDate)}` : ''}` : null,
      `${dedupedDays.length} 天 · ${totalPhotos} 张照片${cityCount > 0 ? ` · ${cityCount} 个地点` : ''}`,
    ].filter(Boolean).join('\n'),
    photos: [],
  })

  // ── 每章
  for (const day of dedupedDays) {
    const dayBudget = perDayBase + (carry > 0 ? 1 : 0)
    if (carry > 0) carry -= 1

    pages.push({
      id: `day-${day.index}`,
      type: 'DAY_OPENING',
      dayIndex: day.index,
      title: day.title || `DAY ${String(day.index).padStart(2, '0')}`,
      caption: day.summary ?? undefined,
      takenAt: day.date ?? undefined,
      body: day.itinerary.length
        ? day.itinerary.map((it) => (it.locationName && it.locationName !== it.title ? `${it.title} · ${it.locationName}` : it.title)).join(' / ')
        : undefined,
      photos: [],
    })

    if (day.photos.length === 0) continue

    const plan = planDay(day.photos, dayBudget, day.date)
    for (const p of plan.selected) selectedIds.add(p.mediaId)

    // PEAK：宽高比 ≥ 1.6 的真横屏才跨页出血（与 lib/modules/album/photo-layout 同口径：
    // 双页画幅 1.6）。跨页出血由 paginate 展开为左右半页。
    if (plan.peak) {
      const isSpread = plan.peak.aspect >= 1.6
      pages.push({
        id: `day-${day.index}-peak`,
        type: 'FULL_BLEED',
        dayIndex: day.index,
        takenAt: plan.peak.takenAt ?? undefined,
        locationName: plan.peak.locationName ?? undefined,
        photos: [plan.peak],
        half: isSpread ? 'spread' : undefined,
        layout: { emphasis: 'peak', variant: isSpread ? 'bleed' : 'full' },
      })
    }

    // PAUSE：一张舒缓的图文页
    if (plan.pause) {
      pages.push({
        id: `day-${day.index}-pause`,
        type: 'PHOTO_CAPTION',
        dayIndex: day.index,
        caption: day.summary ?? undefined,
        takenAt: plan.pause.takenAt ?? undefined,
        locationName: plan.pause.locationName ?? undefined,
        photos: [plan.pause],
        layout: { emphasis: 'pause' },
      })
    }

    // ECHO：其余入选照片，一张一页（保持呼吸感，不做九宫格）
    plan.echo.forEach((photo, i) => {
      const isSpread = photo.aspect >= 1.6
      pages.push({
        id: `day-${day.index}-echo-${i}`,
        type: 'PHOTO_CAPTION',
        dayIndex: day.index,
        takenAt: photo.takenAt ?? undefined,
        locationName: photo.locationName ?? undefined,
        photos: [photo],
        half: isSpread ? 'spread' : undefined,
        layout: { emphasis: 'echo', variant: isSpread ? 'bleed' : undefined },
      })
    })
  }

  // ── 时间线（≥2 章才有意义）
  if (dedupedDays.length >= 2) {
    pages.push({
      id: 'timeline',
      type: 'TIMELINE',
      dayIndex: null,
      title: '旅程线索',
      body: dedupedDays
        .map((d) => `${String(d.index).padStart(2, '0')}  ${d.title || `DAY ${d.index}`}${d.date ? `  ${formatDateCn(d.date)}` : ''}`)
        .join('\n'),
      photos: [],
    })
  }

  // ── 结尾
  pages.push({
    id: 'ending',
    type: 'ENDING',
    dayIndex: null,
    title: input.title,
    subtitle: input.location ?? undefined,
    body: `${dedupedDays.length} 天 · ${totalPhotos} 张照片`,
    photos: [],
  })

  // ── 附录：未入选照片，一张不丢
  const leftover = dedupedDays.flatMap((d) =>
    d.photos.filter((p) => !selectedIds.has(p.mediaId)).map((p) => ({ ...p, __day: d.index })),
  )
  if (leftover.length > 0) {
    const PER_PAGE = 9
    for (let i = 0; i < leftover.length; i += PER_PAGE) {
      const chunk = leftover.slice(i, i + PER_PAGE)
      pages.push({
        id: `index-${i / PER_PAGE}`,
        type: 'INDEX',
        dayIndex: null,
        title: i === 0 ? '更多瞬间' : undefined,
        subtitle: i === 0 ? `${leftover.length} 张未编入正册的照片` : undefined,
        photos: chunk,
        // 附录页在双页模式下整页跨开，才能放下 9 格网格
        half: 'spread',
        layout: { variant: 'index-grid' },
      })
    }
  }

  return {
    pages,
    index: leftover,
    stats: { selected: selectedIds.size, total: totalPhotos },
  }
}

function formatDateCn(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const d = new Date(t)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
