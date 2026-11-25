'use client'

import { useEffect, useState } from 'react'
import RemoteImage from '@/components/mobile/RemoteImage'
import { resolveCoverUrl } from './cover'
import './travel-hero.css'

export interface TravelCoverHeroProps {
  /** 文章标题（作为图片 alt 与占位文案上下文） */
  title: string
  /** 服务端规范化后的封面（优先） */
  coverUrl?: string | null
  /** 未规范化的原始封面值（可能是 /uploads 相对路径或 COS 绝对 URL） */
  cover?: string | null
  /** 详情接口的图片数组（封面 + 回忆照片） */
  images?: string[]
  /** 正文 HTML：旧文章没有 cover 时取正文首图 */
  contentHtml?: string | null
  /** 点击缩略图打开沉浸式查看器 */
  onOpenPhoto?: (index: number) => void
  className?: string
}

/**
 * Web 文章 / 旅行详情页的顶部封面（桌面端专属 · ≥1024px）。
 *
 * 修的 bug：地图 → 省份 → 城市 → CityModal 里点一篇文章，打开后顶部图片空白。
 *  · 之前桌面分支只用 images 铺 4 列小网格：单张封面时只是左上角一个 183px 缩略图，
 *    而 cover / coverUrl 这条真封面链路压根没渲染 —— 视觉上就是"上方一片空白"。
 *  · 现在这里渲染一张真正的英雄封面：coverUrl → cover → images[0] → 正文首图逐级回退
 *    （见 ./cover.ts），并且**加载失败有设计过的兜底占位**，而不是留白或破图标。
 *
 * <1024 由 CSS 直接 display:none（移动端视觉一个像素都不动，移动详情页走 TravelDetailMobile）。
 */
export default function TravelCoverHero({
  title,
  coverUrl,
  cover,
  images,
  contentHtml,
  onOpenPhoto,
  className = '',
}: TravelCoverHeroProps) {
  const [failed, setFailed] = useState(false)
  const src = resolveCoverUrl({ coverUrl, cover, images, contentHtml })
  const photos = (images ?? []).filter(Boolean)

  // 切到另一篇旅行（同一路由换 slug）时重置失败态，否则新封面会被上一次的失败连坐
  useEffect(() => {
    setFailed(false)
  }, [src])

  const showImage = Boolean(src) && !failed

  return (
    <section className={'tch-root ' + className} aria-label="旅程封面">
      <div className="tch-media">
        {showImage ? (
          <RemoteImage
            src={src}
            alt={title || '旅程封面'}
            variant="preview"
            fill
            priority
            className="tch-image"
            onFinalError={() => setFailed(true)}
          />
        ) : (
          <div className="tch-placeholder">
            <svg className="tch-placeholder-art" viewBox="0 0 320 140" aria-hidden="true">
              <path className="tch-art-line" d="M6 118 L74 62 L112 92 L150 48 L206 96 L244 70 L314 118" />
              <path className="tch-art-gold" d="M6 126 H314" strokeDasharray="3 7" />
              <circle className="tch-art-rose" cx="150" cy="48" r="5" />
              <path className="tch-art-line" d="M150 30 V22 M150 74 V66 M132 48 H124 M176 48 H168" />
            </svg>
            <p className="tch-placeholder-title">还没有封面照片</p>
            <p className="tch-placeholder-sub">在「编辑信息」里上传一张封面，或在旅程里添加照片后自动显示</p>
          </div>
        )}

        <div className="tch-vignette" aria-hidden="true" />
        {photos.length > 1 ? <span className="tch-count">{photos.length} 张照片</span> : null}
      </div>

      {photos.length > 1 && onOpenPhoto ? (
        <div className="tch-strip">
          {photos.slice(0, 8).map((url, index) => (
            <button
              key={url + index}
              type="button"
              className="tch-thumb"
              onClick={() => onOpenPhoto(index)}
              aria-label={'查看第 ' + (index + 1) + ' 张照片'}
            >
              <RemoteImage src={url} alt="" variant="thumbnail" fill className="tch-thumb-img" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
