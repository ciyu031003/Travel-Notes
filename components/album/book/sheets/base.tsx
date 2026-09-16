'use client'

import { useState } from 'react'
import { formatDay } from '@/lib/modules/album/presentation'
import type { BookPage, BookPhotoRef } from '@/lib/modules/album/book/types'
import { LazyArtImage } from './LazyArtImage'

/* ==========================================================================
   Book Sheet —— 新版画册页渲染（Album 2.0 M1/M2）
   与旧 reader/ArtPage.tsx 的关系：
     · 视觉语言（纸纹、油角、Source Serif、folio）**完全继承** ArtPage，不换皮；
     · 数据结构换成 lib/modules/album/book/types 的 BookPage / BookSpread：
       页面模板不再自己凑对开配平，出血方向由 paginate 写入的 `side` 决定。
   ========================================================================== */

/* ---------- 封面（布面 + 书名 + 封面照） ---------- */
function CoverPage({ page }: { page: BookPage }) {
  const photo = page.photos[0]
  return (
    <div className="art-page cloth">
      <h2 className="cover-title">{page.title}</h2>
      {page.subtitle && <p className="cover-subtitle">{page.subtitle}</p>}
      {photo && (photo.previewUrl || photo.thumbnailUrl) && (
        <figure className="cover-plate">
          {/* 封面是首屏图：eager + 高优先级，不等 IntersectionObserver */}
          <LazyArtImage
            src={photo.previewUrl || photo.thumbnailUrl}
            alt={page.title ?? '旅行画册封面'}
            placeholderUrl={photo.blurUrl}
            eager
            fetchPriority="high"
          />
        </figure>
      )}
      <p className="cover-foot">{page.takenAt ? formatDay(page.takenAt) : 'Travel Notes'}</p>
    </div>
  )
}

/* ---------- 前言 / 结尾（同版式，内容不同） ---------- */
function TextPage({ page }: { page: BookPage }) {
  const isEnd = page.type === 'ENDING'
  return (
    <div className={`art-page ${isEnd ? 'endpaper' : 'paper'} chapter-intro`}>
      <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
      <div className="chapter-intro-inner">
        {page.title && <h2 className="chapter-title">{page.title}</h2>}
        {page.subtitle && <p className="chapter-date">{page.subtitle}</p>}
        {page.body && <p className="chapter-summary">{page.body}</p>}
      </div>
      {isEnd && <span className="back-mark">Travel Notes</span>}
    </div>
  )
}

/* ---------- DAY 引导页（行程 + 章节信息） ---------- */
function DayOpeningPage({ page }: { page: BookPage }) {
  const day = String(page.dayIndex ?? 0).padStart(2, '0')
  return (
    <div className="art-page paper chapter-intro">
      <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
      <div className="chapter-intro-inner">
        <p className="chapter-kicker">DAY · {day}</p>
        <h2 className="chapter-title">{page.title || `DAY ${day}`}</h2>
        {page.takenAt && <p className="chapter-date">{formatDay(page.takenAt)}</p>}
        {page.caption && <p className="chapter-summary">{page.caption}</p>}
        {page.body && (
          <section className="chapter-section" aria-label="行程">
            <h3>行程</h3>
            <ul className="chapter-itinerary">
              {page.body.split(' / ').slice(0, 8).map((line, i) => (
                <li key={`${line}-${i}`}>
                  <span className="it-spine" aria-hidden="true" />
                  <span className="it-label">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <span className="folio">{day}</span>
    </div>
  )
}

/* ---------- 时间线 ---------- */
function TimelinePage({ page }: { page: BookPage }) {
  return (
    <div className="art-page paper chapter-intro">
      <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
      <div className="chapter-intro-inner">
        <p className="chapter-kicker">JOURNEY</p>
        <h2 className="chapter-title">{page.title || '旅程线索'}</h2>
        <section className="chapter-section">
          <ul className="chapter-itinerary">
            {(page.body ?? '').split('\n').filter(Boolean).map((line, i) => (
              <li key={`${line}-${i}`}>
                <span className="it-spine" aria-hidden="true" />
                <span className="it-label">{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

/* ---------- 附录网格（未编入正册的照片，一张不丢） ---------- */
function IndexPage({ page }: { page: BookPage }) {
  return (
    <div className="art-page paper index-grid-page">
      <div className="index-grid-inner">
        {page.title && <p className="chapter-kicker">{page.title}</p>}
        {page.subtitle && <p className="chapter-date">{page.subtitle}</p>}
        <div className="index-grid">
          {page.photos.map((photo) => (
            <IndexThumb key={photo.mediaId} photo={photo} />
          ))}
        </div>
      </div>
    </div>
  )
}

function IndexThumb({ photo }: { photo: BookPhotoRef }) {
  return (
    <figure className="index-cell">
      <LazyArtImage
        src={photo.thumbnailUrl || photo.previewUrl}
        alt=""
        placeholderUrl={photo.blurUrl}
      />
      {!(photo.thumbnailUrl || photo.previewUrl) && <span className="index-cell-failed" aria-hidden="true" />}
    </figure>
  )
}

/* ---------- 图片加载失败占位由 LazyArtImage 内部渲染（PhotoFailMark） ---------- */

/* ---------- 照片页（单页满幅 / 跨页出血半页） ---------- */
function PhotoPage({ page }: { page: BookPage }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const photo = page.photos[0]
  const side = page.side
  const isHalf = side === 'left' || side === 'right'
  const alt = page.caption || page.locationName || '旅行照片'

  if (!photo) {
    return (
      <div className="art-page paper blank-page">
        <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
        <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
      </div>
    )
  }

  // 图片交给 LazyArtImage：进入视口才发请求 + 邻页由 BookReader 预热 decode()
  const img = (
    <LazyArtImage
      src={photo.previewUrl || photo.thumbnailUrl}
      alt={alt}
      placeholderUrl={photo.blurUrl}
      className={isHalf ? 'spread-img' : undefined}
    />
  )

  if (isHalf) {
    const isLeft = side === 'left'
    return (
      <div className={`art-page paper spread-photo${isLeft ? ' verso' : ''} spread-${side}`}>
        <figure className="plate full">{img}</figure>
        <span className={`oil-edge ${isLeft ? 'oil-tl' : 'oil-tr'}`} aria-hidden="true" />
        <span className={`oil-edge ${isLeft ? 'oil-bl' : 'oil-br'}`} aria-hidden="true" />
        <span className="folio">{String(page.dayIndex ?? 0).padStart(2, '0')}</span>
      </div>
    )
  }

  // 单页满幅：图 + 可选说明（caption / 地点 / 时间）
  const hasMeta = Boolean(page.caption || page.locationName || page.takenAt)
  return (
    <div className={`art-page paper painted${hasMeta ? ' with-caption' : ''}`}>
      <figure className="plate full single-photo">{img}</figure>
      {hasMeta && (
        <figcaption className="plate-caption">
          {page.caption && <span className="plate-caption-text">{page.caption}</span>}
          <span className="plate-caption-meta">
            {page.locationName && <span>{page.locationName}</span>}
            {page.takenAt && <span>{formatDay(page.takenAt)}</span>}
          </span>
        </figcaption>
      )}
      <span className="oil-edge oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-tr" aria-hidden="true" />
      <span className="oil-edge oil-bl" aria-hidden="true" />
      <span className="oil-edge oil-br" aria-hidden="true" />
      <span className="folio">{String(page.dayIndex ?? 0).padStart(2, '0')}</span>
    </div>
  )
}

/* ---------- 空衬页（对开落单时的左页） ---------- */
export function BlankPage() {
  return (
    <div className="art-page paper blank-page">
      <span className="oil-edge oil-faint oil-tl" aria-hidden="true" />
      <span className="oil-edge oil-faint oil-br" aria-hidden="true" />
    </div>
  )
}

/** 默认（画报）版式的页型分发；主题可对个别页型做覆盖后再回落这里 */
export function DefaultPageBody({ page }: { page: BookPage | null }) {
  if (!page) return <BlankPage />
  switch (page.type) {
    case 'COVER': return <CoverPage page={page} />
    case 'OPENING': return <TextPage page={page} />
    case 'ENDING': return <TextPage page={page} />
    case 'DAY_OPENING': return <DayOpeningPage page={page} />
    case 'TIMELINE': return <TimelinePage page={page} />
    case 'INDEX': return <IndexPage page={page} />
    case 'FULL_BLEED':
    case 'PHOTO_CAPTION':
    case 'PHOTO_PAIR':
    case 'COLLAGE':
      return <PhotoPage page={page} />
    default: return <BlankPage />
  }
}

/* 供主题复用/覆盖的内部件 */
export {
  CoverPage as BaseCoverPage,
  TextPage as BaseTextPage,
  DayOpeningPage as BaseDayOpeningPage,
  TimelinePage as BaseTimelinePage,
  IndexPage as BaseIndexPage,
  PhotoPage as BasePhotoPage,
  IndexThumb,
}

