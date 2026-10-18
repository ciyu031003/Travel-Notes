/**
 * Travel 写路径的**规则与计划**（P2-32 拆分产物）。
 *
 * 抽出的理由：原 travel.service 里「校验/归一 + 日期计划 + 权限判定」与
 * 「prisma 调用」混在一起，导致同一段日期算法在 ensureTravelDays 与
 * syncTravelDayDates 里各写一遍，且无法单测。这里把**可计算的部分**收敛为
 * 纯函数（plan*），service 只负责读库 + 按计划落库 —— 也顺带让事务里
 * 的写操作变成"先算后写"，失败点更少。
 *
 * 只有 makeUniqueTravelSlug / canManageTravel 需要读库（唯一性/成员关系查询）。
 */
import { prisma } from '../../db'
import { makeTravelSlug } from './slug'

/** 行程项类型白名单（与前端胶囊一一对应） */
export const ITINERARY_TYPES = ['SPOT', 'RESTAURANT', 'HOTEL', 'TRANSPORT', 'ACTIVITY', 'OTHER']

/** 行程类型归一：未知值一律落 SPOT（避免脏值进库后前端无法渲染） */
export function normalizeItineraryType(value: string | null | undefined): string {
  return ITINERARY_TYPES.includes(value || '') ? (value as string) : 'SPOT'
}

/** 单本旅行「天」的生成上限：避免误填超长区间产生海量空天 */
export const MAX_TRAVEL_DAY_SPAN = 60

/** 预算上限（元）：超过这个数视为误填，拒绝入库 */
export const BUDGET_MAX_YUAN = 100_000_000

/**
 * 解析行程时间（2026-10-17 修正时区语义）
 * ============================================================================
 * 行程的「开始 / 结束」是**墙上时间**（wall clock：行程表上写的 17:00），不是时间点。
 * 之前用 `d.setHours()` 按**服务器时区**解释，客户端再用 `getHours()` 按**设备时区**
 * 读回 —— 两边时区不一致时整体平移。
 *
 * 真实故障：UTC+8 的设备选了 17:00–21:00，服务端（容器 TZ=UTC）存成 17:00Z，
 * 设备按 +8 渲染 → 显示成次日 01:00，21:00 → 05:00。这就是
 * 「选下午5点到晚上9点，回头变成凌晨1点到5点」的根因；也是
 * 「之前添加的行程时间全都乱了」的根因（每条都被平移了同样的量）。
 *
 * 修法：**写入与读取都用 UTC 字段承载墙上时间**（1970-01-01 基准日），与设备/服务器
 * 时区完全解耦：存 17:00，任何时区读出来都是 17:00，确定且可预期。
 * 附带效果：**历史数据自动修复** —— 库里那些 16:50Z / 20:30Z 的记录恰好就是
 * 当初写入的墙上时间，改用 UTC 读取后即正确显示。
 */
export function parseTimeOrDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
    const sec = m[3] ? Math.min(59, Math.max(0, parseInt(m[3], 10))) : 0
    return new Date(Date.UTC(1970, 0, 1, h, min, sec))
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/** 取本地零点：日期对齐按「天」比较，不能带时分秒，否则同一天会被判成不同 */
export function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 本地零点 + n 天（跨月/跨年/夏令时交给 Date 处理） */
export function localMidnightPlusDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/**
 * 旅行区间 → 应生成的天数上限内的日期列表（ensureTravelDays 的计划）。
 * 未填/非法开始日、区间倒置 → 空数组（调用方按「至少 1 天」兜底）。
 */
export function planTravelDayDates(
  startDate?: string | null,
  endDate?: string | null,
): Date[] {
  const s = startDate ? new Date(startDate) : null
  if (!s || Number.isNaN(s.getTime())) return []
  const e = endDate ? new Date(endDate) : null
  const start = localMidnight(s)
  const end = e && !Number.isNaN(e.getTime()) ? localMidnight(e) : start
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  if (days < 0) return []
  const out: Date[] = []
  for (let i = 0; i <= Math.min(days, MAX_TRAVEL_DAY_SPAN - 1); i++) {
    out.push(localMidnightPlusDays(start, i))
  }
  return out
}

/** 区间跨度（天，含首尾），上限 MAX_TRAVEL_DAY_SPAN */
export function planDaySpan(startDate: Date, endDate: Date | null): number {
  const start = localMidnight(startDate)
  const end = endDate && !Number.isNaN(endDate.getTime()) ? localMidnight(endDate) : start
  return (
    Math.max(0, Math.min(Math.round((end.getTime() - start.getTime()) / 86_400_000), MAX_TRAVEL_DAY_SPAN - 1)) + 1
  )
}

export interface DayAlignmentPlan {
  /** 需要就地改日期的天（id → 目标日期） */
  updates: { id: number; date: Date }[]
  /** 区间比现有天数长时需要补出的日期（按「第 existing+j 天」顺序） */
  extraDates: Date[]
}

/**
 * 「天」的日期对齐计划（syncTravelDayDates 的纯计算部分）。
 *
 * 语义（有意选择"就地对齐"而不是"删了重建"）：
 *  · 第 i 天的日期 = 开始日 + i 天；
 *  · 区间变长 → 补出缺失的天；变短 → **保留**多出来的天（里面可能已有回忆/照片，删掉等于毁数据），
 *    只是不再改动它们的日期；
 *  · 日期本来就一致的天空转（不发无意义的 UPDATE）。
 */
export function planDayAlignment(
  days: { id: number; date: Date | string | null; sortOrder: number }[],
  startDate: Date,
  endDate: Date | null,
): DayAlignmentPlan {
  const start = localMidnight(startDate)
  const span = planDaySpan(startDate, endDate)
  const updates: { id: number; date: Date }[] = []

  for (let i = 0; i < Math.min(days.length, span); i++) {
    const target = localMidnightPlusDays(start, i)
    const day = days[i]
    const same = day.date && new Date(day.date).toDateString() === target.toDateString()
    if (same) continue
    updates.push({ id: day.id, date: target })
  }

  const extraDates: Date[] = []
  for (let i = days.length; i < span; i++) {
    extraDates.push(localMidnightPlusDays(start, i))
  }

  return { updates, extraDates }
}

/** 「DAY 01」式标题：序号从 1 起、两位补零 */
export function dayTitle(index: number): string {
  return `DAY ${String(index + 1).padStart(2, '0')}`
}

/** 标题归一（后台编辑）：空白即拒绝，超长拒绝 —— 错误文案是接口契约，勿改 */
export function normalizeTravelTitle(raw: string): string {
  const title = raw.trim()
  if (!title) throw new Error('旅行名称不能为空')
  if (title.length > 120) throw new Error('旅行名称过长（最多 120 字）')
  return title
}

/** 预算严格校验（后台编辑）：非法即抛错（进度条算出负百分比比"没填"更糟） */
export function normalizeBudgetStrict(raw: number | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) throw new Error('预算需为不小于 0 的数字')
  if (n > BUDGET_MAX_YUAN) throw new Error('预算数值过大')
  return n
}

/**
 * 预算宽容归一（同步队列/旧后台路径）：非法值返回 'invalid'，
 * 由调用方**静默丢弃**而不是把脏值写进库。
 */
export function normalizeBudgetLoose(raw: unknown): number | null | 'invalid' {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > BUDGET_MAX_YUAN) return 'invalid'
  return n
}

/**
 * slug 唯一化：`南京之行` 第二次创建时追加 `-2`、`-3`…（最多试 50 次）。
 *
 * 为什么必须做：`Travel.slug` 有唯一约束，而标题是用户自由输入的天然重复项。
 * 早先重复标题会让 prisma.create 抛 P2002，接口 500，前台只看到"创建失败"。
 * @param excludeId 编辑场景下排除自己，避免"只改了日期也被判为重复"
 */
export async function makeUniqueTravelSlug(base: string, excludeId?: number): Promise<string> {
  const taken = async (slug: string) => {
    const found = await prisma.travel.findFirst({
      where: excludeId ? { slug, id: { not: excludeId } } : { slug },
      select: { id: true },
    })
    return !!found
  }
  if (!(await taken(base))) return base
  for (let i = 2; i <= 50; i++) {
    const candidate = `${base}-${i}`
    if (!(await taken(candidate))) return candidate
  }
  // 极端情况兜底：加时间戳，几乎不可能再撞
  return `${base}-${Date.now()}`
}

/** 新建旅行时的 slug（标题 → slug → 唯一化） */
export function travelSlugBase(title: string): string {
  return makeTravelSlug(title)
}

// ============================================================
// 3.6 子资源所有权校验：判断用户是否可管理该旅行。
// 规则：直接归属（ownerId）或所属空间（spaceId）的活跃 OWNER/MEMBER。
// 与 requireCapability（角色）分层：requireCapability 拦 VIEWER，这里拦「别的空间/别人名下的内容」（IDOR）。
// ============================================================
export async function canManageTravel(travelId: number, userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { ownerId: true, spaceId: true },
  })
  if (!travel) return false
  if (travel.ownerId === userId) return true
  if (travel.spaceId) {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId: travel.spaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'MEMBER'] } },
      select: { id: true },
    })
    if (member) return true
  }
  return false
}

/**
 * 封面媒体必须属于这本旅行（防"把别人的照片设成自己的封面"的 IDOR）。
 * Media 表本身没有 travelId，只能顺着「回忆 → 旅行」反查（主照片与多对多关联两条路径）。
 */
export async function assertCoverMediaBelongs(travelId: number, mediaId: number): Promise<void> {
  const media: any = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      memory: { select: { travelId: true } },
      memoryLinks: { select: { memory: { select: { travelId: true } } } },
    },
  })
  if (!media) throw new Error('照片不存在')
  const owners: (number | null)[] = [
    media.memory?.travelId ?? null,
    ...(media.memoryLinks || []).map((l: any) => l.memory?.travelId ?? null),
  ]
  if (!owners.includes(travelId)) throw new Error('这张照片不属于该旅行')
}

/** 由天反查所属旅行 ID（子资源所有权校验用） */
export async function findTravelIdByDayId(dayId: number): Promise<number | null> {
  const day = await prisma.travelDay.findUnique({ where: { id: dayId }, select: { travelId: true } })
  return day?.travelId ?? null
}

/** 由行程项反查所属旅行 ID（子资源所有权校验用） */
export async function findTravelIdByItineraryItemId(itemId: number): Promise<number | null> {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    select: { travelDay: { select: { travelId: true } } },
  })
  return item?.travelDay?.travelId ?? null
}

/** 由花费反查所属旅行 ID（子资源所有权校验用） */
export async function findTravelIdByExpenseId(expenseId: number): Promise<number | null> {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId }, select: { travelId: true } })
  return expense?.travelId ?? null
}
