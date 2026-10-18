/**
 * Travel 规划：管理新数据模型下的旅行 → 天数 → 行程项 → 花费。
 * （面向 P2 的行程与花费管理；公开的旅行详情展示属于 P5）
 *
 * P2-32 拆分说明：读模型映射在 travel.mapper.ts，写路径规则/日期计划在
 * travel.policy.ts，本文件只保留「查询 + 写入编排」。对外导出签名（含类型）
 * 保持不变 —— 类型在此再导出，调用方无需改 import。
 */
import { prisma } from '../../db'
import type { Prisma } from '@prisma/client'
import { syncTravelPost, unpublishTravelPost } from '../social/travel-post.service'
import { yuanToCents } from './money'
import { unifiedMarkdownRenderer } from '../../infrastructure/markdown'
import { skipDbOnBuild } from '../../db-guard'
import { storageKeyToUrl } from '../../media-url'
// P0 收敛：空间成员关系的唯一查询入口（同时按 userId + username 两种键查）
import { myActiveSpaceIds as sharedMyActiveSpaceIds, spaceScopedWhere, isSpaceContentEditor } from '../access/space-scope'
import { writeAuditLog } from '../audit/audit-log.service'
import type {
  ExpenseRecord,
  ItineraryItemRecord,
  TravelDayRecord,
  TravelDayTimelineItem,
  TravelDetail,
  TravelPublicDetail,
  TravelSummary,
} from './travel.types'
import {
  mapExpenseList,
  mapTravelDetail,
  mapTravelList,
  mapTravelPublicDetail,
  mapTravelTimelineDays,
} from './travel.mapper'
import {
  ITINERARY_TYPES,
  assertCoverMediaBelongs,
  canManageTravel,
  dayTitle,
  findTravelIdByDayId,
  findTravelIdByExpenseId,
  findTravelIdByItineraryItemId,
  makeUniqueTravelSlug,
  normalizeBudgetLoose,
  normalizeBudgetStrict,
  normalizeItineraryType,
  normalizeTravelTitle,
  parseTimeOrDate,
  planDayAlignment,
  planTravelDayDates,
  travelSlugBase,
} from './travel.policy'

/** 事务客户端：Prisma 交互式事务回调的 tx；内部函数用它透传，缺省走全局 prisma */
export type TravelTx = Prisma.TransactionClient

// 读模型类型统一放在 travel.types.ts；这里再导出，既有 import 路径不变
export type {
  ExpenseRecord,
  ItineraryItemRecord,
  TravelDayRecord,
  TravelDayTimelineItem,
  TravelDetail,
  TravelPublicDetail,
  TravelSummary,
}

/**
 * 我的活跃空间 id 列表（用于列表可见性）。
 *
 * P0 收敛：原先这里是**本地实现**，而 `lib/modules/access` 与 `album.service`
 * 各自又抄了一份，三份都只按 `userId` 过滤。现在统一走
 * `lib/modules/access/space-scope`（同时按 userId + username 两种键查）。
 */
export async function listTravels(
  userId?: number | null,
  username?: string | null,
): Promise<TravelSummary[]> {
  if (skipDbOnBuild()) return []
  /**
   * 可见性（R3 修复 + P0 收敛）：
   *  · 未登录 → 只公开
   *  · 登录 → 我名下的 或 公开的 或 **我所在活跃空间里的**
   *
   * 最后一条是缺口：详情页走 `canViewResourceById`（支持 `visibility='SPACE'` + 活跃成员），
   * 而列表原先只认 `ownerId`，于是**同空间成员的旅行在 /travel 里看不到、直接开链接又能看**。
   * 两处口径不一致，用户会以为"同步丢了"。
   */
  // 空间分支增加 visibility 限制：PRIVATE 的旅行即使同空间也不对成员开放
  const spaceIds = await sharedMyActiveSpaceIds(userId, username)
  const where = spaceScopedWhere(userId, 'ownerId', spaceIds, ['SPACE', 'PUBLIC'])

  const rows = await prisma.travel.findMany({
    where: where as any,
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { days: true } },
      expenses: true,
      coverMedia: { include: { variants: true } },
      days: {
        orderBy: { sortOrder: 'asc' },
        include: {
          memories: {
            orderBy: { happenedAt: 'asc' },
            include: {
              media: {
                select: { id: true, storageKey: true, variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } } },
              },
            },
          },
        },
      },
    },
  })

  return mapTravelList(rows)
}

export async function getTravelDetail(
  id: number,
  userId?: number | null,
  username?: string | null,
): Promise<TravelDetail | null> {
  // 与 getTravelBySlug / listTravels 同口径：空间成员也能读到空间内的旅行
  const spaceIds = await sharedMyActiveSpaceIds(userId, username)
  const travel = await prisma.travel.findFirst({
    where: { ...(spaceScopedWhere(userId, 'ownerId', spaceIds, ['SPACE', 'PUBLIC']) as object), id } as any,
    include: {
      days: {
        orderBy: { sortOrder: 'asc' },
        include: {
          itineraryItems: {
            orderBy: { sortOrder: 'asc' },
            include: { location: { select: { name: true } } },
          },
        },
      },
      expenses: { orderBy: { happenedAt: 'asc' } },
    },
  })
  if (!travel) return null
  return mapTravelDetail(travel)
}

/** v3.1 M1-A4：按天叙事时间线（旅行 → 每一天 → 行程 → 回忆 → 照片） */
export async function getTravelTimeline(id: number, userId?: number | null): Promise<{ id: number; title: string; days: TravelDayTimelineItem[] } | null> {
  const travel = await prisma.travel.findUnique({
    where: { id },
    select: { id: true, title: true },
  })
  if (!travel) return null

  const days = await prisma.travelDay.findMany({
    where: { travelId: id },
    orderBy: { sortOrder: 'asc' },
    include: {
      itineraryItems: {
        orderBy: { sortOrder: 'asc' },
        include: {
          location: { select: { name: true } },
          // 绑定到该行程的花销：行程视图与总览据此显示「这条行程花了多少钱」
          expenses: { orderBy: { happenedAt: 'asc' } },
        },
      },
      memories: {
        orderBy: { happenedAt: 'asc' },
        include: {
          media: { select: { id: true, storageKey: true, variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } } } },
          mediaLinks: { include: { media: { select: { id: true, storageKey: true, variants: { where: { variant: 'THUMBNAIL' }, select: { storageKey: true } } } } } },
        },
      },
    },
  })

  return { id: travel.id, title: travel.title, days: mapTravelTimelineDays(days) }
}

/**
 * 某本旅行下「回忆照片」的预览图 URL 列表（按时间升序）。
 *
 * 为什么需要：详情页的相册原先只取旅行封面与旧文章图片，**不含回忆里上传的照片**，
 * 于是用户传完照片在最显眼的位置看不到，像是"没传进去"。
 * 这里同时覆盖两种挂载方式：Media.memoryId（主照片）与 MemoryMedia（多对多关联）。
 */
export async function getTravelMemoryPhotos(travelId: number, limit = 60): Promise<string[]> {
  const memories = await prisma.memory.findMany({
    where: { travelId },
    orderBy: [{ happenedAt: 'asc' }, { id: 'asc' }],
    select: {
      media: {
        select: { storageKey: true, variants: { where: { variant: 'PREVIEW' }, select: { storageKey: true } } },
      },
      mediaLinks: {
        orderBy: { sortOrder: 'asc' },
        select: {
          media: {
            select: { storageKey: true, variants: { where: { variant: 'PREVIEW' }, select: { storageKey: true } } },
          },
        },
      },
    },
  })

  /** 与其他读路径同一约定：统一走 storageKeyToUrl，避免漏绝对化。 */
  const urlOf = (m: { storageKey: string; variants: { storageKey: string }[] }) =>
    storageKeyToUrl(m.variants?.[0]?.storageKey || m.storageKey) ?? ''

  const out: string[] = []
  const seen = new Set<string>()
  for (const mem of memories) {
    for (const m of [...mem.media, ...mem.mediaLinks.map((l) => l.media)]) {
      const url = urlOf(m)
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push(url)
      if (out.length >= limit) return out
    }
  }
  return out
}

export async function getTravelBySlug(
  slug: string,
  userId?: number | null,
  username?: string | null,
): Promise<TravelPublicDetail | null> {
  if (skipDbOnBuild()) return null
  /**
   * 读路径必须与 `listTravels` / `canActOnContent` 同口径。
   *
   * 历史缺陷：这里用 `scopedWhere(userId,'ownerId')`（只认 "我名下的 ∪ 公开的"），
   * 于是**空间成员点开共享旅行得到 404**，而同一个人的写请求却被放行 ——
   * 真机表现就是「空间里的旅行大家一起改不了，连看都看不到」。
   * 空间分支再叠一层 visibility 限制：PRIVATE 的旅行即使在同一空间也不对成员开放。
   */
  const spaceIds = await sharedMyActiveSpaceIds(userId, username)
  const t = await prisma.travel.findFirst({
    where: { ...(spaceScopedWhere(userId, 'ownerId', spaceIds, ['SPACE', 'PUBLIC']) as object), slug } as any,
    include: { coverMedia: { include: { variants: true } } },
  })
  if (!t) return null

  const contentHtml = await unifiedMarkdownRenderer
    .render(t.content || '')
    .then((r) => r.html)
    .catch((err) => {
      // 渲染失败不阻断详情页（宁可正文空白也不能 500），但要留下可观测线索
      console.error('[travel.getTravelBySlug] Markdown 渲染失败', { travelId: t.id, err })
      return ''
    })

  return mapTravelPublicDetail(t, contentHtml)
}

export async function createTravel(input: {
  title: string
  description?: string
  startDate?: string
  endDate?: string
  /**
   * 目的地。落 `Travel.location`。
   * 为什么重要：旅行画册按城市成册时用 `findCityByName(Travel.location)` 匹配
   * （lib/modules/album/travel-book.service.ts）；此字段为空时画册只能退化用标题当城市，
   * 容易出现"串册 / 归错城市"。所以新建表单必须能写入它。
   */
  location?: string
  ownerId?: number | null
  isPublic?: boolean
  /**
   * 可见性三档。**必须显式落库**：
   * 表单原先只有「仅自己 / 公开」两个选项、且只写 `isPublic`，而 `visibility`
   * 一直吃 schema 默认的 `SPACE` —— 也就是说用户勾了「仅自己」，旅行其实是
   * 「空间成员可见」。空间一多就会真的泄露。现在由表单决定。
   */
  visibility?: 'PRIVATE' | 'SPACE' | 'PUBLIC'
  /** 直接建在某个空间下（可选）；调用方需先校验我在该空间是 OWNER/MEMBER */
  spaceId?: number | null
  travelType?: 'ALONE' | 'COUPLE' | 'FAMILY' | 'FRIENDS' | 'BFF' | 'GROUP' | 'OTHER'
  companions?: unknown
}): Promise<{ id: number; slug: string }> {
  // slug 走共享生成器，并做唯一化重试：
  // 早先直接拿 makeTravelSlug 的结果写库，同一标题建两次就撞 Travel.slug 唯一约束（P2002），
  // 前台表现为"点了开始记录没反应"。同名旅行是常态（"南京之行"人人都可能建），必须能共存。
  const slug = await makeUniqueTravelSlug(travelSlugBase(input.title))
  const visibility = input.visibility ?? 'SPACE'

  /**
   * P1-15：Travel 行 + 自动生成的「天」+ 公开帖投影必须在**同一个事务**里完成。
   *
   * 老实现三步各自 await、后两步还套了 `.catch(() => {})`，于是天生成失败时
   * 用户拿到一本 0 天的旅行：详情页时间线在 0 天时 `return null`，既看不到分天结构
   * 也加不了行程，而接口照样返回成功 —— 最坏的"半写数据 + 静默失败"组合。
   *
   * 失败语义（有意分层，避免把可用性一起锁死）：
   *  · `ensureTravelDays` 失败 → 这是主操作的**用户可见结果**（0 天 = 不可用），
   *    整体回滚并抛错，让调用方拿到失败而不是一本空壳旅行；
   *  · `syncTravelPost` 失败 → TravelPost 只是 Travel 的派生投影，可重算
   *    （再保存/改可见性都会重新同步），失败仅记日志，不让建旅行失败。
   */
  // 显式放宽事务超时：默认 5s 在多天行程（最多 60 天 createMany）与同步帖时偶发不够；
  // 这里只有一次用户点击，放宽不会放大锁竞争，但能避免"慢一点就整体回滚"的假失败。
  const row = await prisma.$transaction(
    async (tx) => {
    const created = await tx.travel.create({
      data: {
        title: input.title.trim(),
        slug,
        description: input.description || null,
        location: input.location?.trim() || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        status: 'PLANNED',
        ownerId: input.ownerId ?? null,
        // isPublic 与 visibility 保持一致，避免两个字段各说各话
        isPublic: input.isPublic ?? visibility === 'PUBLIC',
        visibility: visibility as never,
        spaceId: input.spaceId ?? null,
        travelType: (input.travelType ?? 'ALONE') as any,
        companions: input.companions ?? undefined,
      },
      // 只回读 id：避免引擎 select-back 整行时对 Json 列（companions）二次序列化（配合 jsonStrings 双保险）
      select: { id: true },
    })

    try {
      await syncTravelPost(created.id, tx)
    } catch (err) {
      console.error('[travel.createTravel] TravelPost 同步失败（派生投影，可重算）', {
        travelId: created.id,
        err,
      })
    }

    // 按日期区间自动生成「天」。
    // 为什么必须做：详情页的按天时间线（TravelTimeline）在 0 天时 `return null`，
    // 于是新旅行既看不到分天结构、也点不到「添加行程」——用户建完旅行无处可动手。
    await ensureTravelDays(created.id, input.startDate, input.endDate, tx)

    return created
    },
    { timeout: 15_000 },
  )

  // 回传 slug：前台「新建旅行 → 直接进该旅行详情页」需要它（详情路由是 /travel/[slug]）
  return { id: row.id, slug }
}

/**
 * 编辑旅行基本信息（标题 / 目的地 / 日期区间 / 描述）。
 *
 * 与 `createTravel` 对称：改标题时同步重算 slug，并返回新 slug —— 前台据此决定是否
 * 需要把地址从旧 slug 跳到新 slug（否则用户改完名字，刷新就 404）。
 * 日期区间变化时同步 TravelDay（见 syncTravelDayDates）。
 */
export async function updateTravelInfo(
  id: number,
  input: {
    title?: string
    location?: string
    startDate?: string | null
    endDate?: string | null
    description?: string | null
    /** 预算（元）。传 null 表示清空；缺省表示不改 */
    budget?: number | null
    /** 封面媒体 id（前台相册「设为封面」）。必须属于这本旅行，见 assertCoverMediaBelongs */
    coverMediaId?: number | null
  },
): Promise<{ slug: string; daysChanged: number }> {
  const current = await prisma.travel.findUnique({
    where: { id },
    select: { title: true, slug: true, startDate: true, endDate: true },
  })
  if (!current) throw new Error('旅行不存在')

  const title = input.title !== undefined ? normalizeTravelTitle(input.title) : undefined

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title
  if (input.location !== undefined) data.location = input.location.trim() || null
  if (input.description !== undefined) data.description = input.description?.trim() || null
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null
  if (input.budget !== undefined) data.budget = normalizeBudgetStrict(input.budget)
  if (input.coverMediaId !== undefined) {
    if (input.coverMediaId === null) {
      data.coverMediaId = null
    } else {
      // 封面必须属于这本旅行，否则可以把别人的照片设成自己的封面
      await assertCoverMediaBelongs(id, input.coverMediaId)
      data.coverMediaId = input.coverMediaId
    }
  }

  // 日期倒置会让「按天」生成负天数；在服务层挡掉，而不是让前台各自判一遍
  const s = (data.startDate as Date | null | undefined) ?? current.startDate
  const e = (data.endDate as Date | null | undefined) ?? current.endDate
  if (s && e && e.getTime() < s.getTime()) throw new Error('结束日期不能早于开始日期')

  // 改标题 → 重算 slug（保持"地址跟着名字走"），旧链接由前台 replace 掉
  let slug = current.slug
  if (title !== undefined && title !== current.title) {
    slug = await makeUniqueTravelSlug(travelSlugBase(title), id)
    data.slug = slug
  }

  /**
   * P1-15：主表 + 公开帖投影 + 「天」日期对齐放进同一个事务。
   *
   * 老实现是三次独立写、后两步 `.catch(() => {})`：改完标题/日期后哪天同步失败，
   * 前台看到的是"改名成功了，但列表里还是旧名字 / 时间线还停在旧日期"，且日志毫无痕迹。
   *
   * 失败语义：
   *  · 主表更新失败 → 整体回滚抛错（用户可见失败，保持原语义）；
   *  · post / day 同步失败 → 记录上下文日志后继续提交（它们是派生/对齐操作，
   *    不该让"改个标题"因为次要写入失败而整体失败）。
   */
  // 日期对齐会逐天 UPDATE（最多 60 条），默认 5s 事务超时在慢库上会假失败，显式放宽
  const daysChanged = await prisma.$transaction(
    async (tx) => {
    await tx.travel.update({ where: { id }, data, select: { id: true } })

    try {
      await syncTravelPost(id, tx)
    } catch (err) {
      console.error('[travel.updateTravelInfo] TravelPost 同步失败（派生投影，可重算）', {
        travelId: id,
        err,
      })
    }

    // 日期变了 → 已存在的「天」要跟着对齐，否则时间线还停在旧日期上
    if (input.startDate === undefined && input.endDate === undefined) return 0
    try {
      return await syncTravelDayDates(id, s, e, tx)
    } catch (err) {
      console.error('[travel.updateTravelInfo] TravelDay 日期对齐失败（可重存触发重试）', {
        travelId: id,
        err,
      })
      return 0
    }
    },
    { timeout: 15_000 },
  )

  return { slug, daysChanged }
}

/**
 * 把 `TravelDay` 的日期对齐到旅行区间。
 *
 * 语义（有意选择"就地对齐"而不是"删了重建"）：
 *  · 第 i 天的日期 = 开始日 + i 天；
 *  · 区间变长 → 补出缺失的天；变短 → **保留**多出来的天（里面可能已有回忆/照片，删掉等于毁数据），
 *    只是不再改动它们的日期；
 *  · 原来没有天的旅行（未填日期就建了）→ 至少补出 1 天，保证详情页有可下手的地方。
 * 返回实际被改动的天数。
 */
export async function syncTravelDayDates(
  travelId: number,
  startDate: Date | null,
  endDate: Date | null,
  tx?: TravelTx,
): Promise<number> {
  const db = tx ?? prisma
  const days = await db.travelDay.findMany({
    where: { travelId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, date: true, sortOrder: true },
  })

  // 没有开始日 → 无法对齐，但至少要保证有 1 天可写
  if (!startDate || Number.isNaN(startDate.getTime())) {
    if (days.length > 0) return 0
    return (await ensureTravelDays(travelId, null, null, tx)).created
  }

  // 先算后写：计划是纯函数（travel.policy.planDayAlignment），
  // 区间变长补天、变短保留多出来的天、日期没变的天不发无意义的 UPDATE
  const plan = planDayAlignment(days, startDate, endDate)
  let changed = 0
  for (const { id, date } of plan.updates) {
    await db.travelDay.update({ where: { id }, data: { date } })
    changed++
  }

  // 区间比现有天数长 → 补齐（沿用 ensureTravelDays 的天数上限语义）
  if (plan.extraDates.length > 0) {
    const maxOrder = await db.travelDay.aggregate({ where: { travelId }, _max: { sortOrder: true } })
    const base = (maxOrder._max.sortOrder ?? days.length - 1) + 1
    await db.travelDay.createMany({
      data: plan.extraDates.map((date, j) => ({
        travelId,
        date,
        title: dayTitle(days.length + j),
        sortOrder: base + j,
      })),
    })
    changed += plan.extraDates.length
  }

  return changed
}

/**
 * 确保旅行有对应的「天」：已有天则不重复创建。
 * 日期区间解析失败（未填日期/区间倒置）时按 1 天处理，保证详情页仍有可编辑的一天。
 */
export async function ensureTravelDays(
  travelId: number,
  startDate?: string | null,
  endDate?: string | null,
  tx?: TravelTx,
): Promise<{ created: number }> {
  const db = tx ?? prisma
  const existing = await db.travelDay.count({ where: { travelId } })
  if (existing > 0) return { created: 0 }

  // 日期计划是纯函数（travel.policy.planTravelDayDates）：上限 60 天；
  // 未填/倒置 → 空数组，这里兜底成「今天」，保证详情页至少有一天可下手
  const dates = planTravelDayDates(startDate, endDate)
  if (dates.length === 0) dates.push(new Date())

  await db.travelDay.createMany({
    data: dates.map((d, i) => ({
      travelId,
      date: d,
      title: dayTitle(i),
      sortOrder: i,
    })),
  })
  return { created: dates.length }
}

export async function updateTravel(id: number, input: any): Promise<void> {
  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) data.description = input.description || null
  // 目的地：后台表单此前不支持改它，而画册按城市成册依赖 `location`，
  // 导致"目的地填错了只能删了重建"。补上。
  if (input.location !== undefined) data.location = input.location?.trim() || null
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null
  if (input.status !== undefined) data.status = input.status
  if (input.isPublic !== undefined) data.isPublic = input.isPublic
  /**
   * 可见性三档（「公开」按钮的落点）。
   * 与 `isPublic` 保持同步：PUBLIC ⇔ isPublic=true，其余一律 false。
   * 两者不同步过一次就会出「看起来公开了、实际只有自己可见」这类幽灵问题。
   */
  if (input.visibility !== undefined) {
    const v = String(input.visibility).toUpperCase()
    if (v === 'PRIVATE' || v === 'SPACE' || v === 'PUBLIC') {
      data.visibility = v
      data.isPublic = v === 'PUBLIC'
    }
  }
  // 预算：同步队列（原生壳）与后台都可能带上来；非法值静默丢弃而不是把脏值写进库
  // （与 updateTravelInfo 的严格校验区分：那是用户直接编辑，这里是重放/兼容路径）
  if (input.budget !== undefined) {
    const n = normalizeBudgetLoose(input.budget)
    if (n !== 'invalid') data.budget = n
  }
  if (input.travelType !== undefined) data.travelType = input.travelType
  if (input.companions !== undefined) data.companions = input.companions
  // P1-15：主表与公开帖投影同事务；post 是派生投影，失败只记日志不阻断（见 createTravel 注释）
  await prisma.$transaction(async (tx) => {
    await tx.travel.update({ where: { id }, data, select: { id: true } })
    try {
      await syncTravelPost(id, tx)
    } catch (err) {
      console.error('[travel.updateTravel] TravelPost 同步失败（派生投影，可重算）', { travelId: id, err })
    }
  })
}

/**
 * 删除旅行：公开帖清理与旅行删除同事务。
 *
 * 老实现先 `unpublishTravelPost().catch(() => {})` 再删旅行：清理失败被吞掉，
 * 而旅行删除本身又会级联 TravelPost（schema onDelete: Cascade）—— 相当于
 * 一次无意义的两次写。现在放进同一事务：要么都成功，要么都不生效。
 */
export async function deleteTravel(id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // TravelPost 有级联删除兜底，这里显式清理只是让"取消公开"语义可读；
    // 即便它失败，tx.travel.delete 的级联仍会移除帖子行。
    try {
      await unpublishTravelPost(id, tx)
    } catch (err) {
      console.error('[travel.deleteTravel] TravelPost 清理失败（将依赖级联删除）', { travelId: id, err })
    }
    await tx.travel.delete({ where: { id } })
  })
}

export async function addDay(travelId: number, input: { date?: string; title?: string; summary?: string }): Promise<{ id: number }> {
  const maxOrder = await prisma.travelDay.aggregate({ where: { travelId }, _max: { sortOrder: true } })
  const row = await prisma.travelDay.create({
    data: {
      travelId,
      date: input.date ? new Date(input.date) : null,
      title: input.title || null,
      summary: input.summary || null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  return { id: row.id }
}

export async function updateDay(id: number, input: any): Promise<void> {
  const data: any = {}
  if (input.date !== undefined) data.date = input.date ? new Date(input.date) : null
  if (input.title !== undefined) data.title = input.title || null
  if (input.summary !== undefined) data.summary = input.summary || null
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  await prisma.travelDay.update({ where: { id }, data })
}

export async function deleteDay(id: number): Promise<void> {
  await prisma.travelDay.delete({ where: { id } })
}

export async function addItineraryItem(dayId: number, input: {
  title: string
  startTime?: string
  endTime?: string
  type?: string
  notes?: string
}): Promise<{ id: number }> {
  const maxOrder = await prisma.itineraryItem.aggregate({ where: { travelDayId: dayId }, _max: { sortOrder: true } })
  const row = await prisma.itineraryItem.create({
    data: {
      travelDayId: dayId,
      title: input.title.trim(),
      startTime: parseTimeOrDate(input.startTime),
      endTime: parseTimeOrDate(input.endTime),
      type: normalizeItineraryType(input.type),
      notes: input.notes || null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  return { id: row.id }
}

export async function deleteItineraryItem(id: number): Promise<void> {
  await prisma.itineraryItem.delete({ where: { id } })
}

export async function addExpense(travelId: number, input: {
  amount: number
  currency?: string
  category?: string
  payer?: string
  note?: string
  happenedAt?: string
  /** 可选：把这笔花销绑定到某条行程（如"11/1 高铁 北京→上海"） */
  itineraryItemId?: number | null
}): Promise<{ id: number }> {
  /**
   * 绑定行程时必须校验该行程**属于本旅行**。
   * 只信前端传来的 id 会让用户（或脚本）把花销挂到别人的行程上；
   * 校验失败按"不绑定"处理而不是报错 —— 行程可能刚被删除，不该因此记不了账。
   */
  let itineraryItemId: number | null = null
  if (input.itineraryItemId != null) {
    const item = await prisma.itineraryItem
      .findUnique({
        where: { id: Number(input.itineraryItemId) },
        select: { travelDay: { select: { travelId: true } } },
      })
      .catch(() => null)
    if (item?.travelDay?.travelId === travelId) itineraryItemId = Number(input.itineraryItemId)
  }

  const row = await prisma.expense.create({
    data: {
      travelId,
      amountCents: yuanToCents(input.amount),
      currency: input.currency || 'CNY',
      category: input.category || 'OTHER',
      payer: input.payer || null,
      note: input.note || null,
      happenedAt: input.happenedAt ? new Date(input.happenedAt) : null,
      itineraryItemId,
    },
  })
  return { id: row.id }
}

export async function deleteExpense(id: number): Promise<void> {
  await prisma.expense.delete({ where: { id } })
}

/** 前台花销 tab：流水 + 合计（预算在 Travel.budget，随 getTravelBySlug 下发） */
export async function getTravelExpenses(travelId: number): Promise<{
  expenses: ExpenseRecord[]
  total: number
}> {
  const travel = await prisma.travel.findUnique({ where: { id: travelId }, select: { id: true } })
  if (!travel) throw new Error('旅行不存在')
  const rows = await prisma.expense.findMany({
    where: { travelId },
    orderBy: [{ happenedAt: 'asc' }, { id: 'asc' }],
  })
  // 行 → DTO（金额「分」→「元」、合计在整数分上求和）由 mapper 统一处理
  return mapExpenseList(rows)
}

/** 修改一个行程项（此前前台只能加、不能改：加错了只能删掉整段旅行重建） */
export async function updateItineraryItem(
  id: number,
  input: { title?: string; startTime?: string | null; endTime?: string | null; type?: string; notes?: string | null },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) throw new Error('行程名称不能为空')
    if (t.length > 120) throw new Error('名称过长（最多 120 字）')
    data.title = t
  }
  if (input.startTime !== undefined) data.startTime = parseTimeOrDate(input.startTime)
  if (input.endTime !== undefined) data.endTime = parseTimeOrDate(input.endTime)
  if (input.type !== undefined) data.type = normalizeItineraryType(input.type)
  if (input.notes !== undefined) data.notes = input.notes ? String(input.notes).slice(0, 500) : null
  if (Object.keys(data).length === 0) return
  await prisma.itineraryItem.update({ where: { id }, data })
}

// P2-32：以下符号的实现已迁到 travel.policy.ts，这里**原样再导出**，调用方 import 路径不变
export {
  ITINERARY_TYPES,
  assertCoverMediaBelongs,
  canManageTravel,
  findTravelIdByDayId,
  findTravelIdByExpenseId,
  findTravelIdByItineraryItemId,
  makeUniqueTravelSlug,
}

// ============================================================
// 旅行归属空间（个人 ↔ 空间）
// ============================================================

export interface TravelSpaceInfo {
  spaceId: number | null
  spaceName: string | null
  /** 我在该空间的角色；null 表示旅行不属于空间或我不是成员 */
  mySpaceRole: string | null
  visibility: string
}

/** 旅行当前的归属空间信息（详情页展示「仅自己 / 某个空间」用） */
export async function getTravelSpaceInfo(travelId: number, userId?: number | null): Promise<TravelSpaceInfo> {
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { spaceId: true, visibility: true, space: { select: { name: true } } },
  })
  if (!travel) return { spaceId: null, spaceName: null, mySpaceRole: null, visibility: 'SPACE' }
  let mySpaceRole: string | null = null
  if (travel.spaceId && userId) {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId: travel.spaceId, userId, status: 'ACTIVE' },
      select: { role: true },
    })
    mySpaceRole = member?.role ?? null
  }
  return {
    spaceId: travel.spaceId ?? null,
    spaceName: travel.space?.name ?? null,
    mySpaceRole,
    visibility: String(travel.visibility ?? 'SPACE'),
  }
}

/**
 * 变更旅行归属空间（`spaceId = null` 表示收回为「仅自己」）。
 *
 * 权限规则（与产品口径一致）：
 *  · **只有旅行的创建者**能改归属 —— 否则任何人都能把别人的旅行拉进自己的空间；
 *  · 移入某个空间时，我还必须是该空间的 **OWNER/MEMBER**（只读成员不能往空间里塞内容）；
 *  · PRIVATE 的旅行移入空间时同步改为 SPACE：否则空间成员「看得见卡片、点开却没内容」，很困惑。
 *
 * 空间成员对空间内旅行的**编辑**权限不在这里判 —— 那由 `canActOnContent`（OWNER/MEMBER）负责。
 */
export async function setTravelSpace(
  travelId: number,
  spaceId: number | null,
  userId: number | null | undefined,
  username?: string | null,
): Promise<{ spaceId: number | null; visibility: string }> {
  if (!userId) throw new Error('未授权')

  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { id: true, ownerId: true, spaceId: true, visibility: true, title: true },
  })
  if (!travel) throw new Error('旅行不存在')
  if (travel.ownerId !== userId) throw new Error('只有这本旅行的创建者可以变更所属空间')

  if (spaceId != null) {
    const canPut = await isSpaceContentEditor(spaceId, userId, username)
    if (!canPut) throw new Error('你在这个空间里是只读成员，不能往里添加内容')
  }

  // PRIVATE 移入空间后升级为 SPACE（空间成员可见）；PUBLIC 保持不动
  const nextVisibility = spaceId != null && travel.visibility === 'PRIVATE' ? 'SPACE' : String(travel.visibility)

  await prisma.travel.update({
    where: { id: travelId },
    data: { spaceId, visibility: nextVisibility as never },
  })

  try {
    await writeAuditLog({
      username: username || String(userId),
      action: 'UPDATE',
      resourceType: 'Travel',
      resourceId: String(travelId),
      spaceId,
      metadata: { title: travel.title, from: travel.spaceId ?? null, to: spaceId },
    })
  } catch (err) {
    // 审计是旁路：失败不能让"改归属"失败，但必须留痕，不能再静默吞掉
    console.error('[travel.setTravelSpace] 审计写入失败', { travelId, spaceId, err })
  }

  return { spaceId, visibility: nextVisibility }
}
