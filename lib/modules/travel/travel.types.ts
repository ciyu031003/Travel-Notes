/**
 * Travel 领域的对外 DTO 类型（P2-32 拆分产物，纯类型、无运行时依赖）。
 *
 * 为什么单独成文件：类型是「读模型契约」，同时被 mapper（数据库行 → DTO）与
 * service（查询/写入编排）使用；若留在 travel.service 里，mapper 只能反向
 * import service，形成循环依赖。这里只放 interface，编译后零产物。
 */

export interface TravelSummary {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  dayCount: number
  expenseTotal: number
  cover: string | null
  coverMediaId: number | null
  /** 旅行内回忆照片（缩略图优先），用于旅行地图左侧照片轮播 */
  photos: string[]
  tags: string[] | null
  location: string | null
  updatedAt: string | null
  visibility: string
  spaceId: number | null
  ownerId: number | null
  /** 归档时刻；null = 进行中草稿（首页大入口继续补内容，不进最近旅行与画册） */
  confirmedAt: string | null
}

export interface ItineraryItemRecord {
  id: number
  title: string
  startTime: string | null
  endTime: string | null
  type: string
  notes: string | null
  locationName: string | null
}

export interface TravelDayRecord {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: ItineraryItemRecord[]
}

export interface ExpenseRecord {
  id: number
  amount: number
  currency: string
  category: string
  payer: string | null
  note: string | null
  happenedAt: string | null
  /** 绑定的行程项 id（null = 未绑定任何行程） */
  itineraryItemId?: number | null
}

export interface TravelDetail {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  days: TravelDayRecord[]
  expenses: ExpenseRecord[]
  updatedAt: string | null
  visibility: string
  spaceId: number | null
  ownerId: number | null
}

export interface TravelDayTimelineItem {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: {
    id: number
    title: string
    startTime: string | null
    endTime: string | null
    type: string
    notes: string | null
    locationName: string | null
    /** 绑定到本条行程的花销（记一笔时选定行程）；未绑定则为空数组 */
    expenses: {
      id: number
      amount: number
      currency: string
      category: string
      payer: string | null
      note: string | null
      happenedAt: string | null
    }[]
  }[]
  /** 当天的回忆（含其照片） */
  memories: {
    id: number
    title: string
    content: string | null
    mood: string | null
    happenedAt: string | null
    photos: { id: number; url: string }[]
  }[]
  /** 当天照片（由当天回忆的照片去重汇总，v3.1 M1-A4） */
  photos: { id: number; url: string }[]
}

export interface TravelPublicDetail {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  contentHtml: string
  tags: string[] | null
  location: string | null
  cover: string | null
  /** 由 coverMedia 规范化出来的封面 URL（缩略图优先）；前台「设为封面」后据此即时可见 */
  coverUrl: string | null
  coverMediaId: number | null
  travelType: string | null
  companions: unknown
  /** 旅行预算（元）；未填为空 → 花销 tab 只显示已花合计 */
  budget: number | null
  /** 归档时刻；null = 进行中草稿 */
  confirmedAt: string | null
}
