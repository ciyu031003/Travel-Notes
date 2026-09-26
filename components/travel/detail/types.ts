/**
 * 移动端旅行详情 · 共享类型
 *
 * 与 `GET /api/travels/:id/timeline`、`GET /api/travels/:id/expenses`、
 * `GET /api/travels/by-slug/:slug/detail` 的响应形状一一对应。
 * 抽到这里是为了让四个 tab 组件不必各自复述一遍（改接口时只需改一处）。
 */

export interface TimelineItineraryItem {
  id: number
  title: string
  startTime: string | null
  endTime: string | null
  type: string
  notes: string | null
  locationName: string | null
}

export interface TimelinePhoto {
  id: number
  url: string
}

export interface TimelineMemory {
  id: number
  title: string
  content: string | null
  mood: string | null
  happenedAt: string | null
  photos: TimelinePhoto[]
}

export interface TimelineDay {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: TimelineItineraryItem[]
  memories: TimelineMemory[]
  photos: TimelinePhoto[]
}

/** 详情页需要的旅行字段（服务端 detail 接口的子集） */
export interface TravelInfoForDetail {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status?: string
  contentHtml?: string
  tags?: string[] | null
  location: string | null
  cover: string | null
  coverUrl?: string | null
  coverMediaId?: number | null
  travelType?: string | null
  companions?: unknown
  budget?: number | null
  ownerId?: number | null
  canEdit?: boolean
  /** 归属空间：null = 仅自己（个人旅行） */
  spaceId?: number | null
  spaceName?: string | null
  /** 我在该空间的角色（OWNER/MEMBER/VIEWER）；决定是否可编辑空间内内容 */
  mySpaceRole?: string | null
  /** 我是不是这本旅行的创建者 —— 决定能否变更归属空间 */
  canMoveSpace?: boolean
  visibility?: string
  /** 仅在本地 SQLite 里、还没同步上云（离线兜底渲染时为 true） */
  pendingSync?: boolean
}

export interface ExpenseItem {
  id: number
  amount: number
  currency: string
  category: string
  payer: string | null
  note: string | null
  happenedAt: string | null
}

export interface ExpenseState {
  expenses: ExpenseItem[]
  total: number
  budget: number | null
}

/** 沉浸查看器接受的照片形状（id 用于「设为封面」） */
export interface ViewerPhotoLike {
  id?: number
  url: string
}

/** 相册上传的容器回忆标题（与服务端 `PHOTO_MEMORY_TITLE` 保持一致） */
export const PHOTO_MEMORY_TITLE = '旅行照片'
