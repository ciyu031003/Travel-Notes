'use client'

import { formatDay } from '@/lib/modules/album/presentation'
import { LazyArtImage } from '../sheets/LazyArtImage'
import type { BookTheme, PageBodyProps } from './types'

/**
 * 手记（Memory）
 *
 * 视觉：旅行手记 —— 便签纸、纸胶带、票据、印章、克制的书写感。
 * 刻意**不做**"儿童手账"：不加贴纸堆叠、不加彩色马克笔、不做满屏手写字；
 * 胶带与印章各只用一处（封面 + 结尾），内页保持可读。
 */

/** 纸胶带（封面与手记页各一处，不滥用） */
function TapeStrip({ className = '' }: { className?: string }) {
  return <span className={`mem-tape ${className}`} aria-hidden="true" />
}

function MemoryCover({ page }: PageBodyProps) {
  const photo = page.photos[0]
  return (
    <div className="art-page mem-cover">
      <TapeStrip className="mem-tape--tl" />
      <TapeStrip className="mem-tape--tr" />
      <div className="mem-cover-inner">
        <p className="mem-cover-kicker">TRAVEL NOTES</p>
        <h2 className="mem-cover-title">{page.title}</h2>
        {page.subtitle && <p className="mem-cover-sub">{page.subtitle}</p>}
        {photo && (photo.previewUrl || photo.thumbnailUrl) && (
          <figure className="mem-cover-photo">
            <LazyArtImage
              src={photo.previewUrl || photo.thumbnailUrl}
              alt={page.title ?? '旅行画册封面'}
              placeholderUrl={photo.blurUrl}
              eager
              fetchPriority="high"
            />
          </figure>
        )}
        {page.takenAt && <p className="mem-cover-date">{formatDay(page.takenAt)}</p>}
      </div>
      <span className="mem-stamp" aria-hidden="true">
        <span>行迹</span>
      </span>
    </div>
  )
}

function MemoryDayNote({ page }: PageBodyProps) {
  const day = String(page.dayIndex ?? 0).padStart(2, '0')
  return (
    <div className="art-page mem-note">
      <div className="mem-note-inner">
        <p className="mem-note-kicker">DAY {day}</p>
        <h2 className="mem-note-title">{page.title || `DAY ${day}`}</h2>
        {page.takenAt && <p className="mem-note-date">{formatDay(page.takenAt)}</p>}
        {page.caption && <p className="mem-note-body">{page.caption}</p>}
        {page.body && (
          <ul className="mem-note-list">
            {page.body.split(' / ').slice(0, 6).map((line, i) => (
              <li key={`${line}-${i}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <span className="folio">{day}</span>
    </div>
  )
}

function MemoryPhoto({ page }: PageBodyProps) {
  const photo = page.photos[0]
  const side = page.side
  const isHalf = side === 'left' || side === 'right'
  const alt = page.caption || page.locationName || '旅行照片'

  if (!photo) {
    return (
      <div className="art-page mem-note">
        <div className="mem-note-inner" />
      </div>
    )
  }

  if (isHalf) {
    const isLeft = side === 'left'
    return (
      <div className={`art-page mem-photo mem-photo--half${isLeft ? ' mem-photo--left' : ' mem-photo--right'}`}>
        <figure className="mem-photo-frame">
          <LazyArtImage
            src={photo.previewUrl || photo.thumbnailUrl}
            alt={alt}
            placeholderUrl={photo.blurUrl}
            className="mem-photo-img"
          />
        </figure>
        <span className="folio">{String(page.dayIndex ?? 0).padStart(2, '0')}</span>
      </div>
    )
  }

  const hasMeta = Boolean(page.caption || page.locationName || page.takenAt)
  return (
    <div className={`art-page mem-photo${hasMeta ? ' mem-photo--with-note' : ''}`}>
      <figure className="mem-photo-frame">
        <LazyArtImage
          src={photo.previewUrl || photo.thumbnailUrl}
          alt={alt}
          placeholderUrl={photo.blurUrl}
          className="mem-photo-img"
        />
      </figure>
      {hasMeta && (
        <div className="mem-photo-note">
          {page.caption && <p className="mem-photo-caption">{page.caption}</p>}
          <p className="mem-photo-meta">
            {page.locationName && <span>{page.locationName}</span>}
            {page.takenAt && <span>{formatDay(page.takenAt)}</span>}
          </p>
        </div>
      )}
      <span className="folio">{String(page.dayIndex ?? 0).padStart(2, '0')}</span>
    </div>
  )
}

/** 附录：便签拼贴（照片贴在小票/便签纸上） */
function MemoryBoard({ page }: PageBodyProps) {
  return (
    <div className="art-page mem-board">
      <div className="mem-board-inner">
        {page.title && <p className="mem-board-title">{page.title}</p>}
        {page.subtitle && <p className="mem-board-sub">{page.subtitle}</p>}
        <div className="mem-board-grid">
          {page.photos.map((photo, i) => (
            <figure
              className="mem-board-cell"
              key={photo.mediaId}
              style={{ ['--mem-rot' as string]: `${((i * 37) % 7) - 3}deg` }}
            >
              <LazyArtImage src={photo.thumbnailUrl || photo.previewUrl} alt="" placeholderUrl={photo.blurUrl} />
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 结尾：票据 + 印章（手记主题唯一"重装饰"的一页，作为收束） */
function MemoryReceipt({ page }: PageBodyProps) {
  return (
    <div className="art-page mem-receipt">
      <div className="mem-receipt-inner">
        <p className="mem-receipt-head">行迹 · TRAVEL NOTES</p>
        <h2 className="mem-receipt-title">{page.title}</h2>
        {page.subtitle && <p className="mem-receipt-sub">{page.subtitle}</p>}
        <div className="mem-receipt-line" aria-hidden="true" />
        {page.body && <p className="mem-receipt-body">{page.body}</p>}
        <div className="mem-receipt-line" aria-hidden="true" />
        <p className="mem-receipt-foot">谢谢翻阅，收藏这段路上的时光。</p>
      </div>
    </div>
  )
}

export const MEMORY_THEME: BookTheme = {
  key: 'memory',
  label: '手记',
  description: '旅行手记 · 票据便签 · 克制的书写感',
  tokens: {
    // 比画报更暖一点的纸张（旧信纸），文字仍是暖墨
    '--book-paper': '#f6f1e4',
    '--book-ink': '#3b352c',
    '--book-accent': 'var(--color-travel-accent, #A85F3A)',
    '--book-cloth': '#8a7a63',
    '--book-line': 'rgba(59,53,44,0.2)',
    '--book-serif': "'Source Serif 4', 'Songti SC', 'Noto Serif CJK SC', Georgia, serif",
    // 正文走无衬线（手记更偏「记录」而不是「杂志」）
    '--book-sans': "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    // 不用手写字体：不引入新字体文件（体积），也不做「儿童手账」
    '--book-grain-opacity': '0.07',
    '--book-photo-filter': 'saturate(0.94) contrast(1.02) sepia(0.1)',
  },
  bodies: {
    DAY_OPENING: MemoryDayNote,
    FULL_BLEED: MemoryPhoto,
    PHOTO_CAPTION: MemoryPhoto,
    PHOTO_PAIR: MemoryPhoto,
    COLLAGE: MemoryPhoto,
    INDEX: MemoryBoard,
    // 结尾换成票据页；前言 / 时间线沿用画报版式
    ENDING: MemoryReceipt,
  },
  cover: MemoryCover,
}
