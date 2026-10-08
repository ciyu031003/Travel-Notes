/** 首页画册摘要：与 /api/travel-book 摘要口径一致，不含章节明细。 */
export interface HomeBookSummary {
  bookKey: string
  title: string
  location: string | null
  startDate: string | null
  coverThumb: string | null
  dayCount: number
  photoCount: number
}

/** 首页碎碎念入口只需要最近内容的展示字段。 */
export interface HomeMoment {
  id: number
  content: string
  tags: string[] | null
  createdAt: string
}
