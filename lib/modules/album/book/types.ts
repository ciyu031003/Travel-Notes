/**
 * Travel Book（旅行画册 2.0）页面模型 —— 数据层唯一类型来源。
 *
 * 设计要点（与 ChatGPT 原方案的差异）：
 *  1. **宽高比必须由服务端给出**（`BookPhotoRef.aspect`）。原方案让客户端在图片 onLoad 后
 *     回填宽高，那会让版式在翻页中途改变——而翻页运行时（page-flip）每换一次页面集合就要
 *     销毁并重建整本书。把「已知」放在服务端，是消灭该缺陷的前提。
 *  2. **BookPage 与 BookSpread 分层**：页面模板（PHOTO_PAIR / COLLAGE）不再自己凑奇偶配平，
 *     对开（spread）由 `paginate()` 统一决定。旧实现在渲染器里 `placed % 2 === 1 → push(blank)`，
 *     一旦引入模板就会崩。
 *  3. 本文件只放类型，**不放业务逻辑**，避免组件 ↔ 服务端循环引用。
 */

/** 照片在画册里的最小必要信息 */
export interface BookPhotoRef {
  /** Media.id；Post 存量图无 Media 行时使用合成的稳定负序号 */
  mediaId: number
  /** 原图 URL（PhotoViewer 用） */
  fullUrl: string | null
  thumbnailUrl: string | null
  previewUrl: string | null
  blurUrl: string | null
  /** 宽 / 高，服务端保证非 null；无法解析时填 1 */
  aspect: number
  /** 拍摄时间（ISO） */
  takenAt: string | null
  /** 地点名（Location.name 或 Post.location） */
  locationName: string | null
}

export type BookPageType =
  | 'COVER'
  | 'OPENING'
  | 'DAY_OPENING'
  | 'FULL_BLEED'
  | 'PHOTO_CAPTION'
  | 'PHOTO_PAIR'
  | 'COLLAGE'
  | 'TIMELINE'
  | 'TEXT'
  | 'INDEX'
  | 'ENDING'

/** 版式意图：主题可读，但**不得**改变分页结果 */
export interface BookPageLayout {
  variant?: string
  /** 书籍节奏标记：峰值 / 停顿 / 回声 */
  emphasis?: 'peak' | 'pause' | 'echo'
}

export interface BookPage {
  id: string
  type: BookPageType
  /** 章（TravelDay）序号，1-based；封面/前言/结尾为 null */
  dayIndex: number | null
  title?: string
  subtitle?: string
  caption?: string
  body?: string
  locationName?: string
  takenAt?: string
  /** 本页承载的照片：FULL_BLEED=1、PHOTO_PAIR=2、COLLAGE=2..4、INDEX=n */
  photos: BookPhotoRef[]
  /**
   * 跨页出血页的**逻辑页**标记（仅当整幅照片跨双页时出现）。
   * `paginate` 会把它展开成对开里的左半页 + 右半页（两页引用同一张照片）。
   * 单页模式下的一半页会被忽略，整页按 contain 完整展示。
   */
  half?: 'spread'
  /** 排版完成后的物理页身份（由 paginate 写入，渲染器据此决定出血方向） */
  side?: 'left' | 'right'
  /** 版式意图：主题可读，但**不得**改变分页结果 */
  layout?: BookPageLayout
}

/** 翻页单位（对开）。`left === null` 表示该跨页只有右页（封面、章首右页起排） */
export interface BookSpread {
  id: string
  left: BookPage | null
  right: BookPage
  /** 全书连续页码（1-based），用于 PageIndicator 与 folio */
  pageNumber: number
}

/** 阅读器的版式模式：单页（移动）或双页对开（桌面） */
export type BookSpreadMode = 'single' | 'dual'
