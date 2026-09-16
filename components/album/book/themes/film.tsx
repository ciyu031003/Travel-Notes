'use client'

import { useState } from 'react'
import { formatDay } from '@/lib/modules/album/presentation'
import type { BookPage } from '@/lib/modules/album/book/types'
import { LazyArtImage } from '../sheets/LazyArtImage'
import type { BookTheme, PageBodyProps } from './types'

/**
 * 胶片（Film）
 *
 * 视觉：负片齿孔边框、胶片编号、日期戳（橙红）、接触印相式附录。
 * 只覆盖「封面 / DAY 引导 / 照片页 / 附录」四类页型——前言、时间线、结尾
 * 沿用画报版式（它们本来就是文字页，胶片化没有增益，反而喧宾夺主）。
 */

/** 齿孔：上下两条规则排列的小方孔，纯 CSS 生成（不引图片） */
function Sprocket({ count = 12 }: { count?: number }) {
  return (
    <span className="film-sprocket" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <i key={i} />)}
    </span>
  )
}

function FilmDateStamp({ iso }: { iso: string | null | undefined }) {
  if (!iso) return null
  return <span className="film-datestamp">{formatDay(iso).replace(/-/g, ' ')}</span>
}

function FilmCover({ page }: PageBodyProps) {
  const photo = page.photos[0]
  return (
    <div className="art-page film-cover">
      <Sprocket />
      <div className="film-cover-plate">
        {photo && (photo.previewUrl || photo.thumbnailUrl) && (
          <LazyArtImage
            src={photo.previewUrl || photo.thumbnailUrl}
            alt={page.title ?? '旅行画册封面'}
            placeholderUrl={photo.blurUrl}
            eager
            fetchPriority="high"
          />
        )}
      </div>
      <div className="film-cover-meta">
        <p className="film-cover-roll">ROLL 01 · {page.subtitle || 'TRAVEL NOTES'}</p>
        <h2 className="film-cover-title">{page.title}</h2>
        <FilmDateStamp iso={page.takenAt} />
      </div>
      <Sprocket />
    </div>
  )
}

function FilmDayOpening({ page }: PageBodyProps) {
  const day = String(page.dayIndex ?? 0).padStart(2, '0')
  return (
    <div className="art-page film-page">
      <div className="film-frame">
        <div className="film-frame-head">
          <span className="film-frame-no">FRAME {day}</span>
          <FilmDateStamp iso={page.takenAt} />
        </div>
        <h2 className="film-frame-title">{page.title || `DAY ${day}`}</h2>
        {page.caption && <p className="film-frame-note">{page.caption}</p>}
        {page.body && <p className="film-frame-itinerary">{page.body}</p>}
      </div>
    </div>
  )
}

function FilmPhoto({ page }: PageBodyProps) {
  const [failed, setFailed] = useState(false)
  const photo = page.photos[0]
  const side = page.side
  const isHalf = side === 'left' || side === 'right'
  const alt = page.caption || page.locationName || '旅行照片'

  if (!photo) {
    return (
      <div className="art-page film-page">
        <div className="film-frame film-frame--empty" />
      </div>
    )
  }

  const image = (
    <LazyArtImage
      src={photo.previewUrl || photo.thumbnailUrl}
      alt={alt}
      placeholderUrl={photo.blurUrl}
      className={isHalf ? 'film-negative-img' : 'film-negative-img film-negative-img--single'}
    />
  )

  if (isHalf) {
    const isLeft = side === 'left'
    return (
      <div className={`art-page film-negative${isLeft ? ' film-negative--left' : ' film-negative--right'}`}>
        <Sprocket count={10} />
        <div className="film-negative-plate">{image}</div>
        <Sprocket count={10} />
        <FilmDateStamp iso={page.takenAt} />
        {failed && <span className="film-failed">照片加载失败</span>}
      </div>
    )
  }

  return (
    <div className="art-page film-page">
      <div className="film-frame">
        <div className="film-frame-head">
          <span className="film-frame-no">{String(page.dayIndex ?? 0).padStart(2, '0')}</span>
          <FilmDateStamp iso={page.takenAt} />
        </div>
        <div className="film-frame-plate">{image}</div>
        {(page.caption || page.locationName) && (
          <div className="film-frame-foot">
            {page.caption && <span className="film-frame-caption">{page.caption}</span>}
            {page.locationName && <span className="film-frame-loc">{page.locationName}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

/** 附录：接触印相（contact sheet）—— 3×3 细框 + 帧号 */
function FilmContactSheet({ page }: PageBodyProps) {
  return (
    <div className="art-page film-contact-sheet">
      <div className="film-cs-inner">
        {page.title && <p className="film-cs-title">{page.title}</p>}
        {page.subtitle && <p className="film-cs-sub">{page.subtitle}</p>}
        <div className="film-cs-grid">
          {page.photos.map((photo, i) => (
            <figure className="film-cs-cell" key={photo.mediaId}>
              <LazyArtImage
                src={photo.thumbnailUrl || photo.previewUrl}
                alt=""
                placeholderUrl={photo.blurUrl}
              />
              <figcaption>{String(i + 1).padStart(2, '0')}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <Sprocket count={14} />
    </div>
  )
}

export const FILM_THEME: BookTheme = {
  key: 'film',
  label: '胶片',
  description: '胶片负片 · 齿孔边框 · 日期戳 · 接触印相',
  tokens: {
    '--book-paper': '#16130f',
    '--book-ink': '#efe7d8',
    '--book-accent': '#d9762f',
    '--book-cloth': '#241d16',
    '--book-line': 'rgba(239,231,216,0.22)',
    '--book-serif': "'Source Serif 4', Georgia, serif",
    '--book-sans': "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    // 轻颗粒（胶片感）；强度刻意很低，不做"满屏噪点"
    '--book-grain-opacity': '0.18',
    // 负片调性：略降饱和、加对比、偏暖
    '--book-photo-filter': 'saturate(0.86) contrast(1.08) sepia(0.12)',
  },
  bodies: {
    DAY_OPENING: FilmDayOpening,
    FULL_BLEED: FilmPhoto,
    PHOTO_CAPTION: FilmPhoto,
    PHOTO_PAIR: FilmPhoto,
    COLLAGE: FilmPhoto,
    INDEX: FilmContactSheet,
  },
  cover: FilmCover,
}

/* 未覆盖的页型（OPENING / TIMELINE / ENDING）由 BookPageBody 回落画报版式 */
