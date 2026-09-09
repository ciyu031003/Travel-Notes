'use client'

import type { SyntheticEvent } from 'react'
import { MOOD_LABEL, formatDay } from '@/lib/modules/album/presentation'
import type { Book, BookChapter, BookPhoto } from '../travel-book/TravelBook'

/* ==========================================================================
   Art Mode 页面组件（相册画册阅读器）
   - 仿画册排印：Source Serif 4 衬线体
   - 照片按横竖屏自适应：竖屏单页整幅展示，横屏跨两页出血展示
   - 材质质感（纸纹/布面/油角点缀）
   ========================================================================== */

/* ---------- 照片横竖屏判定 ---------- */
export type PhotoVariant = 'single' | 'spread-left' | 'spread-right'

/**
 * 判定照片横竖屏：
 * - 宽 > 高 × 1.05 视为横屏（跨两页出血展示）
 * - 其余（含未知宽高）视为竖屏（单页完整展示，不裁剪）
 */
export function photoOrientation(
  photo: BookPhoto,
  measured?: { w: number; h: number } | null,
): 'landscape' | 'portrait' {
  const w = measured?.w ?? photo.width
  const h = measured?.h ?? photo.height
  if (w && h && w > h * 1.05) return 'landscape'
  return 'portrait'
}

/* ---------- 封面（cloth 布面 + 书名/副标题/封面图） ---------- */
export function ArtCoverPage({ book }: { book: Book }) {
  return (
    <div className="art-page cloth">
      <h2 className="cover-title">{book.title}</h2>
      {book.location && <p className="cover-subtitle">{book.location}</p>}
      {book.coverPreview && (
        <figure className="cover-plate">
          <img src={book.coverPreview} alt={book.title} />
        </figure>
      )}
      <p className="cover-foot">
        {book.startDate ? formatDay(book.startDate) : 'Travel Notes'}
      </p>
    </div>
  )
}

/* ---------- 章节标题页（DAY 引导页：行程 / 回忆 / 照片计数） ---------- */
export function ArtChapterIntro({ chapter }: { chapter: BookChapter }) {
  const day = String(chapter.index).padStart(2, '0')
  const title = chapter.title || `DAY ${day}`
  const itinerary = chapter.itinerary || []
  const memories = chapter.memories || []
  const photoCount = chapter.photos?.length ?? 0
  const itineraryCut = itinerary.length > 6
  const memoriesCut = memories.length > 3
  return (
    <div className="art-page paper chapter-intro">
      <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
      <div className="chapter-intro-inner">
        <p className="chapter-kicker">DAY · {day}</p>
        <h2 className="chapter-title">{title}</h2>
        {chapter.date && <p className="chapter-date">{formatDay(chapter.date)}</p>}
        {chapter.summary && <p className="chapter-summary">{chapter.summary}</p>}

        {itinerary.length > 0 && (
          <section className="chapter-section" aria-label="行程">
            <h3>行程</h3>
            <ul className="chapter-itinerary">
              {itinerary.slice(0, 6).map((it) => (
                <li key={it.id}>
                  <span className="it-spine" aria-hidden="true" />
                  <span className="it-label">{it.title || '未命名行程'}</span>
                  {it.locationName && it.locationName !== it.title && (
                    <span className="it-loc">{it.locationName}</span>
                  )}
                </li>
              ))}
            </ul>
            {itineraryCut && (
              <p className="chapter-more">还有 {itinerary.length - 6} 处停留</p>
            )}
          </section>
        )}

        {memories.length > 0 && (
          <section className="chapter-section" aria-label="回忆">
            <h3>回忆</h3>
            <div className="chapter-memories">
              {memories.slice(0, 3).map((mem) => (
                <div className="memory-line" key={mem.id}>
                  <p className="memory-title">
                    {mem.title || '未命名回忆'}
                    {mem.mood ? (
                      <span className="memory-mood">{MOOD_LABEL[mem.mood] || mem.mood}</span>
                    ) : null}
                  </p>
                  {mem.content && <p className="memory-content">{mem.content}</p>}
                </div>
              ))}
            </div>
            {memoriesCut && (
              <p className="chapter-more">还有 {memories.length - 3} 条回忆</p>
            )}
          </section>
        )}

        {photoCount > 0 && (
          <p className="chapter-count">{photoCount} 张照片</p>
        )}
      </div>
      <span className="folio">{day}</span>
    </div>
  )
}

/* ---------- 照片页 ----------
   variant:
   - single       竖屏：单页整幅展示（contain，头脚完整，不裁剪）
   - spread-left  横屏跨页左半页：整幅出血，只显露左半，油角在左上/左下
   - spread-right 横屏跨页右半页：整幅出血，只显露右半，油角在右上/右下
   跨页左右两页各自渲染同一张图（200% 宽），借助 overflow:hidden 拼成无缝出血跨页。 */
export function ArtPhotoSpread({
  chapter,
  photo,
  variant = 'single',
  onPhotoMeasure,
}: {
  chapter: BookChapter
  photo: BookPhoto
  variant?: PhotoVariant
  onPhotoMeasure?: (id: number, w: number, h: number) => void
}) {
  const realSrc = photo.previewUrl || photo.thumbnailUrl
  const photoAlt = chapter.title
    ? chapter.title + (chapter.date ? ' · ' + formatDay(chapter.date) : '')
    : '旅行照片'

  // 服务端未提供宽高时（如旧 Post 画册兜底），等图片加载后用自然尺寸补判横竖屏
  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    if (!onPhotoMeasure || (photo.width != null && photo.height != null)) return
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      onPhotoMeasure(photo.id, img.naturalWidth, img.naturalHeight)
    }
  }

  if (variant === 'spread-left' || variant === 'spread-right') {
    const isLeft = variant === 'spread-left'
    return (
      <div className={`art-page paper spread-photo${isLeft ? ' verso' : ''} ${variant}`}>
        <figure className="plate full">
          <img
            src={realSrc || ''}
            alt={photoAlt}
            loading="lazy"
            className="spread-img"
            onLoad={handleLoad}
          />
        </figure>
        <span className={`oil-edge ${isLeft ? 'oil-tl' : 'oil-tr'}`} aria-hidden="true" />
        <span className={`oil-edge ${isLeft ? 'oil-bl' : 'oil-br'}`} aria-hidden="true" />
        <span className="folio">
          {String(chapter.index).padStart(2, '0')}
        </span>
      </div>
    )
  }

  return (
    <div className="art-page paper painted">
      <figure className="plate full single-photo">
        <img src={realSrc || ''} alt={photoAlt} loading="lazy" onLoad={handleLoad} />
      </figure>
      <span className="oil-edge oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-tr" aria-hidden="true" />
      <span className="oil-edge oil-bl" aria-hidden="true" />
      <span className="oil-edge oil-br" aria-hidden="true" />
      <span className="folio">
        {String(chapter.index).padStart(2, '0')}
      </span>
    </div>
  )
}

/* ---------- 空白衬页（跨页配平用） ---------- */
export function ArtBlankPage({ chapter }: { chapter?: BookChapter }) {
  return (
    <div className="art-page paper blank-page">
      <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
      {chapter && (
        <span className="blank-mark">
          DAY {String(chapter.index).padStart(2, '0')}
          {chapter.title ? ` · ${chapter.title}` : ''}
        </span>
      )}
    </div>
  )
}

/* ---------- 总结页（colophon + 统计） ---------- */
export function ArtSummaryPage({ book }: { book: Book }) {
  return (
    <div className="art-page endpaper">
      <span className="oil-edge oil-faint oil-tr" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-bl" aria-hidden="true" />
      <div className="colophon">
        <p>{book.title}</p>
        {book.location && <p>{book.location}</p>}
        <p className="small-print">
          {book.dayCount || book.chapters.length} 天 · {book.photoCount} 张照片
        </p>
        <p className="small-print" style={{ marginTop: 'calc(var(--cq) * 2)' }}>
          谢谢翻阅，收藏这段路上的时光。
        </p>
      </div>
      <span className="back-mark">Travel Notes</span>
    </div>
  )
}

/* ---------- 空白衬页 ---------- */
export function ArtEndpaper() {
  return <div className="art-page endpaper" />
}

/* ---------- PageBody 分发器 ---------- */
export type ArtPage =
  | { kind: 'cover' }
  | { kind: 'chapter'; chapter: BookChapter }
  | { kind: 'photo'; chapter: BookChapter; photo: BookPhoto; variant: PhotoVariant }
  | { kind: 'blank'; chapter?: BookChapter }
  | { kind: 'summary' }

export function ArtPageBody({
  page,
  book,
  onPhotoMeasure,
}: {
  page: ArtPage
  book: Book
  onPhotoMeasure?: (id: number, w: number, h: number) => void
}) {
  switch (page.kind) {
    case 'cover':
      return <ArtCoverPage book={book} />
    case 'chapter':
      return <ArtChapterIntro chapter={page.chapter} />
    case 'photo':
      return (
        <ArtPhotoSpread
          chapter={page.chapter}
          photo={page.photo}
          variant={page.variant}
          onPhotoMeasure={onPhotoMeasure}
        />
      )
    case 'blank':
      return <ArtBlankPage chapter={page.chapter} />
    case 'summary':
      return <ArtSummaryPage book={book} />
    default:
      return null
  }
}
