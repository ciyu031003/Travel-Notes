'use client'

import { Camera, MapPin } from 'lucide-react'
import { formatDay } from '@/lib/modules/album/presentation'
import type { Book, BookChapter, BookPhoto } from '../travel-book/TravelBook'

/* ==========================================================================
   Art Mode 页面组件
   源自 create-photo-flipbook-ui skill 的摄影画册设计语言：
   - 克制排版，Source Serif 4 衬线体
   - 大幅留白，照片以 plate 容器居中呈现
   - 材料质感（纸纹/布面/扉页）
   ========================================================================== */

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

/* ---------- 章节标题页（内页 title-block） ---------- */
export function ArtChapterIntro({ chapter }: { chapter: BookChapter }) {
  return (
    <div className="art-page paper">
      <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
      <div className="title-block">
        <h2>{chapter.title || 'DAY ' + String(chapter.index).padStart(2, '0')}</h2>
        <p>{chapter.summary || '——'}</p>
        {chapter.date && (
          <p style={{ marginTop: '3cqw', fontSize: '1.8cqw', color: '#73766c' }}>
            {formatDay(chapter.date)}
          </p>
        )}
      </div>
      <span className="folio">{String(chapter.index).padStart(2, '0')}</span>
    </div>
  )
}

/* ---------- 照片跨页（plate 容器，按需选择尺寸） ---------- */
export function ArtPhotoSpread({ chapter, photo }: { chapter: BookChapter; photo: BookPhoto }) {
  const realSrc = photo.previewUrl || photo.thumbnailUrl
  const photoAlt = chapter.title
    ? chapter.title + (chapter.date ? ' · ' + formatDay(chapter.date) : '')
    : '旅行照片'

  return (
    <div className="art-page paper painted">
      <figure className="plate full">
        <img src={realSrc || ''} alt={photoAlt} loading="lazy" />
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
        <p className="small-print" style={{ marginTop: '2cqw' }}>
          谢谢翻阅，收藏这段路上的时光。
        </p>
      </div>
      <span className="back-mark">Travel Notes</span>
    </div>
  )
}

/* ---------- 空白扉页 ---------- */
export function ArtEndpaper() {
  return <div className="art-page endpaper" />
}

/* ---------- PageBody 分发器 ---------- */
export type ArtPage =
  | { kind: 'cover' }
  | { kind: 'chapter'; chapter: BookChapter }
  | { kind: 'photo'; chapter: BookChapter; photo: BookPhoto }
  | { kind: 'summary' }

export function ArtPageBody({ page, book }: { page: ArtPage; book: Book }) {
  switch (page.kind) {
    case 'cover':
      return <ArtCoverPage book={book} />
    case 'chapter':
      return <ArtChapterIntro chapter={page.chapter} />
    case 'photo':
      return <ArtPhotoSpread chapter={page.chapter} photo={page.photo} />
    case 'summary':
      return <ArtSummaryPage book={book} />
    default:
      return null
  }
}
