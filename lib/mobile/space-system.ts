/**
 * 空间类型系统 —— 与 `lib/mobile/icon-system.ts` 同构的单一事实源。
 *
 * 为什么需要它：
 * 1. 原先「情侣/家人/朋友/个人/其他」的文案、emoji、色调**硬编码在 `SpacePanel.tsx` 组件里**
 *    （`SPACE_TYPE_LABEL` / `SPACE_TYPE_EMOJI`），而且用 emoji 冒充图标 ——
 *    违反《移动端设计规范》§1「禁止用字符冒充图标」。
 * 2. 空间类型现在还要驱动**主题配色**（`[data-space]` 作用域），
 *    类型 → 主题的映射必须有唯一出口，否则组件会各自拼字符串。
 *
 * 颜色**不在这里声明**：色值全部在 `app/globals.css` 的 `[data-space='X']` 块里，
 * 组件只写 `bg-[var(--space-accent-strong)]` 这类 token 引用（禁止裸 hex）。
 */
import type { LucideIcon } from 'lucide-react'
import {
  Heart,
  UsersRound,
  Users,
  MountainSnow,
  Sparkles,
  type BadgeTone,
} from './icon-system'

/* ══════════════════════════════════════════════════════════════════════════
   1. 空间类型（对齐 prisma enum SpaceType）
   ══════════════════════════════════════════════════════════════════════════ */

export const SPACE_TYPES = ['COUPLE', 'FAMILY', 'FRIENDS', 'SOLO', 'OTHER'] as const
export type SpaceTypeValue = (typeof SPACE_TYPES)[number]
export const DEFAULT_SPACE_TYPE: SpaceTypeValue = 'OTHER'

/**
 * 类型标签。
 * SOLO 用「独旅空间」而不是「个人空间」：与旅行关系类型（`TravelType.ALONE` = 独旅）
 * 以及《多元旅行场景优化方案》的用词保持一致；自动创建的那个另标「个人空间」。
 */
export const SPACE_TYPE_LABELS: Record<string, string> = {
  COUPLE: '情侣空间',
  FAMILY: '家庭空间',
  FRIENDS: '朋友空间',
  SOLO: '独旅空间',
  OTHER: '其他空间',
}

/** 一句话说明（创建时展示在类型卡片下方） */
export const SPACE_TYPE_HINTS: Record<string, string> = {
  COUPLE: '两个人的旅行',
  FAMILY: '带上家人一起',
  FRIENDS: '和朋友结伴',
  SOLO: '一个人的路上',
  OTHER: '还没想好',
}

export const SPACE_TYPE_ICONS: Record<string, LucideIcon> = {
  COUPLE: Heart,
  FAMILY: UsersRound,
  FRIENDS: Users,
  SOLO: MountainSnow,
  OTHER: Sparkles,
}

/**
 * 徽标色调（`Pill` / `IconBadge` 用）。
 * 注意：这是**暖色 tone**，与空间主题色（`--space-*`）是两套东西 ——
 * 徽标继续保持全站统一的暖色语义，主题色只用于空间模块的强调面。
 */
export const SPACE_TYPE_TONES: Record<string, BadgeTone> = {
  COUPLE: 'blush',
  FAMILY: 'sun',
  FRIENDS: 'accent',
  SOLO: 'clay',
  OTHER: 'neutral',
}

/** 默认空间名建议（创建表单的 placeholder 用） */
export const SPACE_TYPE_NAME_HINTS: Record<string, string> = {
  COUPLE: '例如：我们的小家',
  FAMILY: '例如：全家出行记',
  FRIENDS: '例如：老友出发',
  SOLO: '例如：一个人的地图',
  OTHER: '例如：我的旅行空间',
}

export function isSpaceType(value: unknown): value is SpaceTypeValue {
  return typeof value === 'string' && (SPACE_TYPES as readonly string[]).includes(value)
}

function normalize(type?: string | null): string {
  return isSpaceType(type) ? type : DEFAULT_SPACE_TYPE
}

export function spaceTypeLabelOf(type?: string | null): string {
  return SPACE_TYPE_LABELS[normalize(type)]
}

export function spaceTypeHintOf(type?: string | null): string {
  return SPACE_TYPE_HINTS[normalize(type)]
}

export function spaceTypeIconOf(type?: string | null): LucideIcon {
  return SPACE_TYPE_ICONS[normalize(type)]
}

export function spaceTypeToneOf(type?: string | null): BadgeTone {
  return SPACE_TYPE_TONES[normalize(type)]
}

/**
 * 主题作用域值。刻意不直接返回 `type`：
 * 未知类型要回落到 `OTHER`，否则 `data-space="XXX"` 不匹配任何 CSS 块，
 * 组件会拿到 `:root` 的兜底色（虽然不报错，但会与徽标色调不一致）。
 */
export function spaceThemeOf(type?: string | null): SpaceTypeValue {
  return normalize(type) as SpaceTypeValue
}

/* ══════════════════════════════════════════════════════════════════════════
   2. 成员角色
   ══════════════════════════════════════════════════════════════════════════ */

export const SPACE_ROLE_LABELS: Record<string, string> = {
  OWNER: '主人',
  MEMBER: '成员',
  VIEWER: '访客',
}

export const SPACE_ROLE_HINTS: Record<string, string> = {
  OWNER: '可管理空间与成员',
  MEMBER: '可一起编辑旅行、相册与回忆',
  VIEWER: '只能查看，不能修改',
}

export function spaceRoleLabelOf(role?: string | null): string {
  return (role && SPACE_ROLE_LABELS[role]) || '访客'
}

/* ══════════════════════════════════════════════════════════════════════════
   3. 空间动态（对齐 AuditLog.action / resourceType，读侧零改库）
   ══════════════════════════════════════════════════════════════════════════ */

const ACTIVITY_RESOURCE_LABELS: Record<string, string> = {
  Space: '空间',
  SpaceMember: '成员',
  SpaceInvite: '邀请',
  Travel: '旅行',
  TravelDay: '行程',
  ItineraryItem: '行程项',
  Expense: '花费',
  Album: '相册',
  Memory: '回忆',
  Media: '照片',
  TimelineItem: '时间线',
}

const ACTIVITY_RESOURCE_ICONS: Record<string, LucideIcon> = {
  Space: Sparkles,
  SpaceMember: Users,
  SpaceInvite: Users,
  Travel: MountainSnow,
  TravelDay: MountainSnow,
  ItineraryItem: MountainSnow,
  Expense: MountainSnow,
  Album: Sparkles,
  Memory: Heart,
  Media: Sparkles,
  TimelineItem: Heart,
}

/**
 * 动态文案：`<谁> <做了什么>`。
 * 只覆盖 AuditAction 的既有取值（不新增枚举），未知动作回落到「更新了内容」。
 */
const ACTION_VERBS: Record<string, string> = {
  CREATE: '创建了',
  UPDATE: '更新了',
  DELETE: '删除了',
  UPLOAD_MEDIA: '上传了',
  DELETE_MEDIA: '删除了',
  INVITE_MEMBER: '邀请了新成员',
  UPDATE_PERMISSIONS: '调整了成员权限',
  SETTINGS_UPDATE: '更新了空间设置',
}

export function activityResourceLabelOf(resourceType?: string | null): string {
  return (resourceType && ACTIVITY_RESOURCE_LABELS[resourceType]) || '内容'
}

export function activityResourceIconOf(resourceType?: string | null): LucideIcon {
  return (resourceType && ACTIVITY_RESOURCE_ICONS[resourceType]) || Sparkles
}

export function activityVerbOf(action?: string | null): string {
  return (action && ACTION_VERBS[action]) || '更新了'
}

/** 从 AuditLog.metadata（JSON 文本）里尽力取一个可读的对象名 */
export function activitySubjectOf(metadata?: string | null): string {
  if (!metadata) return ''
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    for (const key of ['title', 'name', 'member', 'memberUsername', 'removed', 'left']) {
      const v = parsed[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  } catch {
    // metadata 不是合法 JSON：忽略
  }
  return ''
}

/**
 * 动态整句的「谓语部分」。
 *
 * 为什么要有这个函数：最初是「动词 + 资源名」直接拼接，于是出现了
 * 「调整了权限**成员**」「邀请了新成员**邀请**」这种读不通的文案 ——
 * 动词本身已经含了对象，再拼一次资源名就重复了。
 * 现在由这里统一裁决：动词自带对象的不再拼资源名；否则用 metadata 里的对象名
 * （`「大理 5 天」`），拿不到对象名才回落成「资源名」。
 */
export function activityPredicateOf(
  action?: string | null,
  resourceType?: string | null,
  metadata?: string | null,
): { verb: string; subject: string; isQuoted: boolean } {
  const verb = activityVerbOf(action)
  const subject = activitySubjectOf(metadata)

  // 这几类动词自带对象，不再追加资源名
  const selfContained = action === 'INVITE_MEMBER' || action === 'UPDATE_PERMISSIONS' || action === 'SETTINGS_UPDATE'
  if (selfContained) {
    // 「调整了成员权限」+ metadata.member 时有更具体的说法：调整了「阿虎」的权限
    if (action === 'UPDATE_PERMISSIONS' && subject) {
      return { verb: '调整了', subject, isQuoted: true }
    }
    return { verb, subject: '', isQuoted: false }
  }

  if (subject) return { verb, subject, isQuoted: true }
  return { verb, subject: activityResourceLabelOf(resourceType), isQuoted: false }
}
