/**
 * 计划结构化 + 实时协同的**纯类型**（客户端/服务端 API 的镜像）。
 *
 * 为什么单独一份：计划详情页是静态导出的客户端壳，若从 lib/modules/space/*
 * 取类型会把 prisma/service 拖进浏览器 bundle。字段名以
 * docs/plan-p1-collab-spec.md §2/§3 与 P1a 的 REST 响应为准。
 */

export type PlanStatus = 'PLANNING' | 'CONFIRMED' | 'DONE'
export type PlanTaskKind = 'TODO' | 'PACK' | 'PLACE'
export type PlanItemKind = 'TRANSPORT' | 'HOTEL' | 'FOOD' | 'SPOT' | 'ACTIVITY' | 'FLEX'

export interface PlanTaskRow {
  id: string
  text: string
  kind: PlanTaskKind
  done: boolean
  doneBy: string | null
  doneAt: string | null
}

/** 计划级字段（GET 详情的 plan / 列表 / PATCH 响应同构） */
export interface PlanRecord {
  id: number
  spaceId: number
  title: string
  destination: string | null
  startDate: string | null
  endDate: string | null
  budget: number | null
  note: string | null
  status: PlanStatus
  tasks: PlanTaskRow[]
  taskCount: number
  taskDoneCount: number
  planMeta: Record<string, unknown> | null
  coverMediaId: number | null
  docRevision: number
  version: number
  createdById: number | null
  createdBy: string | null
  convertedTravelId: number | null
  convertedTravelSlug: string | null
  createdAt: string
  updatedAt: string
}

/** 计划的一天（GET 详情的 days[]；items 另给扁平数组，不重复用嵌套） */
export interface PlanDayRow {
  id: number
  planId: number
  /** 'YYYY-MM-DD' */
  date: string | null
  title: string | null
  theme: string | null
  summary: string | null
  sortOrder: number
  version: number
  updatedBy: string | null
  updatedAt: string
}

/** 计划里的一块行程（GET 详情的 items[]，REST 写响应同构） */
export interface PlanItemRow {
  id: number
  dayId: number
  kind: PlanItemKind
  /** ISO（UTC 字段即墙上时间，渲染取 slice(11,16)） */
  startAt: string | null
  endAt: string | null
  title: string
  place: string | null
  /** 金额用分 */
  costCents: number | null
  note: string | null
  done: boolean
  doneBy: string | null
  sortOrder: number
  version: number
  updatedBy: string | null
  updatedAt: string
  mediaIds: number[]
}

export interface PlanMemberLite {
  username: string
  nickname: string | null
  avatarUrl: string | null
  role: string
}

/** 落库的在线状态（GET 详情的 presence；WS awareness 是它的实时版本） */
export interface PlanPresenceRow {
  userId: number
  username: string
  nickname: string | null
  editingItemId: number | null
  cursor: number | null
  lastSeenAt: string
}

export interface PlanDetailPayload {
  plan: PlanRecord
  days: PlanDayRow[]
  items: PlanItemRow[]
  members: PlanMemberLite[]
  presence: PlanPresenceRow[]
  docRevision: number
  lastEventId: number
}

/** 协同用户（awareness.user；color 用调色板槽位号，颜色在 CSS 里按槽位给） */
export interface CollabUser {
  id: number
  username: string
  nickname: string | null
  /** 0..5：远端光标/头像的配色槽位（CSS 变量 --pc-peer-${slot}），避免 tsx 里写裸色 */
  slot: number
}

export type CollabStatus = 'idle' | 'connecting' | 'live' | 'offline'

/** 一个远端协作者（awareness 每条本地状态 = 一个客户端；同一账号多标签也算多个） */
export interface PlanPeer {
  clientId: number
  user: CollabUser | null
  editingItemId: number | null
  /** 正在编辑的字段（title/place/note；own 之外的人看不到时是 null） */
  editingField: string | null
  /** 该人对当前打开字段的光标（全局位置） */
  cursor: number | null
  cursorEnd: number | null
}

/** 协同事件：REST 写冲突（409）后交给 UI 决定用谁的版本 */
export interface PlanConflictInfo {
  itemId: number
  /** 服务端当前行（对方的版本） */
  current: PlanItemRow
  /** 我提交时以为的 version */
  expected: number
  /** 我这次想写进去的短字段 */
  patch: Partial<PlanItemRow>
}
