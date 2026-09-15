/**
 * 移动端图标体系 · 唯一事实源
 * ============================================================================
 * 规范（禁止在组件内另写数值）：
 *   · 尺寸仅 3 档：sm 16 / md 20 / lg 24（默认 md）
 *   · 描边仅 2 档：2（sm/md）· 1.75（lg，避免大图标视觉过重）
 *   · 色调仅取自 token（暖色），不用裸 hex
 *   · 需要"更大"的视觉重量时，放大容器（IconBadge），不要放大图标
 *
 * 本文件同时承载「语义 → 图标」映射表，替代各处散落的硬编码图标选择。
 */
import {
  // 导航 / 基础
  Home,
  MapPin,
  Map,
  Route,
  Compass,
  User,
  Users,
  UsersRound,
  Users2,
  Heart,
  HeartHandshake,
  CircleEllipsis,
  // 内容
  CalendarDays,
  Image as ImageIcon,
  Images,
  Camera,
  BookOpen,
  BookMarked,
  Sparkles,
  ChartColumn,
  MessageCircle,
  Bell,
  // 行程类型
  Landmark,
  UtensilsCrossed,
  BedDouble,
  Ticket,
  ShoppingBag,
  // 活动 / 运动（球类 · 走路 · 散步 …）
  Volleyball,
  Footprints,
  SportShoe,
  Bike,
  Waves,
  Mountain,
  MountainSnow,
  TentTree,
  Dumbbell,
  PersonStanding,
  // 交通
  Plane,
  TrainFront,
  CarFront,
  Ship,
  // 天气
  Sun,
  Cloud,
  CloudRain,
  Cloudy,
  CloudSnow,
  // 类型
  type LucideIcon,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════════════════════
   1. 尺寸与描边（唯一允许的档位）
   ══════════════════════════════════════════════════════════════════════════ */

export const ICON_SIZE = { sm: 16, md: 20, lg: 24 } as const
export const ICON_STROKE = { sm: 2, md: 2, lg: 1.75 } as const

export type IconSize = keyof typeof ICON_SIZE

/** 图标色调：全部指向 token / currentColor，不含裸 hex */
export type IconTone =
  | 'inherit'
  | 'text'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'inverse'
  | 'success'
  | 'warning'
  | 'danger'

/* ══════════════════════════════════════════════════════════════════════════
   2. 暖色徽标色调（IconBadge 用）—— 前景色已按 WCAG AA 校核
   ══════════════════════════════════════════════════════════════════════════ */

export const BADGE_TONES = ['accent', 'sun', 'blush', 'clay', 'neutral'] as const
export type BadgeTone = (typeof BADGE_TONES)[number]

export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  accent: 'bg-[var(--m-tone-accent-bg)] text-[var(--m-tone-accent-fg)]',
  sun: 'bg-[var(--m-tone-sun-bg)] text-[var(--m-tone-sun-fg)]',
  blush: 'bg-[var(--m-tone-blush-bg)] text-[var(--m-tone-blush-fg)]',
  clay: 'bg-[var(--m-tone-clay-bg)] text-[var(--m-tone-clay-fg)]',
  neutral: 'bg-[var(--m-tone-neutral-bg)] text-[var(--m-tone-neutral-fg)]',
}

/* ══════════════════════════════════════════════════════════════════════════
   3. 行程类型（对齐 ItineraryItem.type）
      来源：lib/modules/travel/travel.service.ts → ITINERARY_TYPES
      背景：此前 TravelTimeline 对全部类型硬编码同一个 MapPin，类型字段完全没用上。
   ══════════════════════════════════════════════════════════════════════════ */

export const ITINERARY_TYPES = [
  'SPOT',
  'RESTAURANT',
  'HOTEL',
  'TRANSPORT',
  'ACTIVITY',
  'OTHER',
] as const

export type ItineraryType = (typeof ITINERARY_TYPES)[number]

export const ITINERARY_LABELS: Record<ItineraryType, string> = {
  SPOT: '景点',
  RESTAURANT: '餐厅',
  HOTEL: '住宿',
  TRANSPORT: '交通',
  ACTIVITY: '活动',
  OTHER: '其他',
}

export const ITINERARY_ICON: Record<ItineraryType, LucideIcon> = {
  SPOT: Landmark,
  RESTAURANT: UtensilsCrossed,
  HOTEL: BedDouble,
  TRANSPORT: Route,
  ACTIVITY: Volleyball,
  OTHER: CircleEllipsis,
}

export const ITINERARY_TONE: Record<ItineraryType, BadgeTone> = {
  SPOT: 'accent',
  RESTAURANT: 'sun',
  HOTEL: 'clay',
  TRANSPORT: 'neutral',
  ACTIVITY: 'blush',
  OTHER: 'neutral',
}

/** 容错取图标：未知类型回落 OTHER，避免运行时报错 */
export function itineraryIconOf(type?: string | null): LucideIcon {
  return ITINERARY_ICON[(type as ItineraryType) ?? 'OTHER'] ?? ITINERARY_ICON.OTHER
}
export function itineraryLabelOf(type?: string | null): string {
  return ITINERARY_LABELS[(type as ItineraryType) ?? 'OTHER'] ?? ITINERARY_LABELS.OTHER
}
export function itineraryToneOf(type?: string | null): BadgeTone {
  return ITINERARY_TONE[(type as ItineraryType) ?? 'OTHER'] ?? ITINERARY_TONE.OTHER
}

/* ══════════════════════════════════════════════════════════════════════════
   4. 活动子类型（球类运动 · 徒步 · 散步 · 骑行 · 游泳 · 登山 · 滑雪 · 露营 …）
      用途：行程项 ACTIVITY 的细分、旅行回忆标签、未来「活动」筛选。
      选型原则：字形本身圆润、端点圆角，配暖色 IconBadge 后整体柔和。
   ══════════════════════════════════════════════════════════════════════════ */

export const ACTIVITY_KINDS = [
  'BALL',
  'WALK',
  'STROLL',
  'BIKE',
  'SWIM',
  'HIKE',
  'SKI',
  'CAMP',
  'FITNESS',
  'PHOTO',
  'SHOP',
  'SHOW',
] as const

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  BALL: '球类运动',
  WALK: '徒步',
  STROLL: '散步',
  BIKE: '骑行',
  SWIM: '游泳',
  HIKE: '登山',
  SKI: '滑雪',
  CAMP: '露营',
  FITNESS: '健身',
  PHOTO: '摄影',
  SHOP: '购物',
  SHOW: '观演',
}

export const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  BALL: Volleyball,
  WALK: Footprints,
  STROLL: SportShoe,
  BIKE: Bike,
  SWIM: Waves,
  HIKE: Mountain,
  SKI: MountainSnow,
  CAMP: TentTree,
  FITNESS: Dumbbell,
  PHOTO: Camera,
  SHOP: ShoppingBag,
  SHOW: Ticket,
}

/** 活动色调：只用暖色，保证整组视觉统一 */
export const ACTIVITY_TONE: Record<ActivityKind, BadgeTone> = {
  BALL: 'accent',
  WALK: 'clay',
  STROLL: 'sun',
  BIKE: 'blush',
  SWIM: 'neutral',
  HIKE: 'clay',
  SKI: 'neutral',
  CAMP: 'sun',
  FITNESS: 'accent',
  PHOTO: 'clay',
  SHOP: 'blush',
  SHOW: 'sun',
}

/* ══════════════════════════════════════════════════════════════════════════
   5. 旅行关系类型（对齐 prisma enum TravelType）
      此前仅有纯文字 pill，无图标 —— 本次补齐。
   ══════════════════════════════════════════════════════════════════════════ */

export const TRAVEL_TYPE_LABELS: Record<string, string> = {
  ALONE: '独旅',
  COUPLE: '情侣',
  FAMILY: '家庭',
  FRIENDS: '朋友',
  BFF: '闺蜜/兄弟',
  GROUP: '结伴',
  OTHER: '其他',
}

export const TRAVEL_TYPE_ICON: Record<string, LucideIcon> = {
  ALONE: User,
  COUPLE: Heart,
  FAMILY: UsersRound,
  FRIENDS: Users,
  BFF: HeartHandshake,
  GROUP: Users2,
  OTHER: CircleEllipsis,
}

export const TRAVEL_TYPE_TONE: Record<string, BadgeTone> = {
  ALONE: 'neutral',
  COUPLE: 'blush',
  FAMILY: 'sun',
  FRIENDS: 'accent',
  BFF: 'clay',
  GROUP: 'sun',
  OTHER: 'neutral',
}

export function travelTypeIconOf(type?: string | null): LucideIcon {
  return (type && TRAVEL_TYPE_ICON[type]) || TRAVEL_TYPE_ICON.OTHER
}
export function travelTypeLabelOf(type?: string | null): string {
  return (type && TRAVEL_TYPE_LABELS[type]) || type || TRAVEL_TYPE_LABELS.OTHER
}
export function travelTypeToneOf(type?: string | null): BadgeTone {
  return (type && TRAVEL_TYPE_TONE[type]) || TRAVEL_TYPE_TONE.OTHER
}

/* ══════════════════════════════════════════════════════════════════════════
   6. 出行方式（交通细分）
   ══════════════════════════════════════════════════════════════════════════ */

export const TRANSPORT_KINDS = ['PLANE', 'TRAIN', 'CAR', 'SHIP', 'WALK'] as const
export type TransportKind = (typeof TRANSPORT_KINDS)[number]

export const TRANSPORT_LABELS: Record<TransportKind, string> = {
  PLANE: '飞机',
  TRAIN: '高铁/火车',
  CAR: '自驾',
  SHIP: '轮渡',
  WALK: '步行',
}

export const TRANSPORT_ICON: Record<TransportKind, LucideIcon> = {
  PLANE: Plane,
  TRAIN: TrainFront,
  CAR: CarFront,
  SHIP: Ship,
  WALK: PersonStanding,
}

/* ══════════════════════════════════════════════════════════════════════════
   7. 天气（统一为线性 + 暖/中性 token，不再填充色块）
   ══════════════════════════════════════════════════════════════════════════ */

export type WeatherKind = 'sunny' | 'cloudy' | 'rainy' | 'overcast' | 'snowy'

export const WEATHER_ICON: Record<WeatherKind, LucideIcon> = {
  sunny: Sun,
  cloudy: Cloudy,
  rainy: CloudRain,
  overcast: Cloud,
  snowy: CloudSnow,
}

/*
 * 天气「不」提供 tone 映射，这是有意为之：
 * 天气图标沿用 travel-info 模块的调色板（TravelInfoColors：sunny #E4B478 /
 * cloudy·rainy #A8C8DC / overcast #5A6670），若改套本文件的 tone（指向 --m-*），
 * 云雨会由蓝变棕 —— 属规范 §5.3 的跨主题静默变色。
 * 因此 WeatherIcon 只从这里取「图标」，颜色由使用方按自己体系决定。
 */

/* ══════════════════════════════════════════════════════════════════════════
   8. 导航语义（去重：MapPin 不再同时表示地点/省份/旅行/足迹四种含义）
   ══════════════════════════════════════════════════════════════════════════ */

export const NAV_ICON: Record<string, LucideIcon> = {
  home: Home,        // 首页
  travel: Route,     // 旅行（Tab）
  circle: Compass,   // 旅行圈
  me: User,          // 我的
  map: Map,          // 足迹地图
  place: MapPin,     // 地点 / 城市（唯一语义）
  album: Images,     // 画册 / 相册
  photo: ImageIcon,  // 单张照片
  book: BookOpen,    // 画册阅读
  bookmark: BookMarked,
  timeline: CalendarDays,
  moment: MessageCircle,
  stats: ChartColumn, // 替代已废弃的 BarChart3
  sparkle: Sparkles,
  bell: Bell,
}
