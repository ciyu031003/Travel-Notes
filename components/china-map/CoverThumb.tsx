'use client'

import { useEffect, useState } from 'react'
import RemoteImage from '@/components/mobile/RemoteImage'
import { normalizeCoverUrl } from './cover-url'
import './china-map-thumbs.css'

/**
 * 地图弹层里的封面缩略图（城市弹窗 / 省份面板共用）。
 *
 * 此前两处都用 next/image 直接渲染 post.cover：
 *  · 远端域名没进 next.config 的 images.remotePatterns 时，next/image 会抛
 *    「Invalid src prop … hostname is not configured」把整块弹层打白；
 *  · cover 与 images[0] 混用、相对/绝对 URL 混用，脏值直接变成破图标；
 *  · 没有失败兜底：图挂了就是一个空色块。
 * 现在统一走 normalizeCoverUrl（脏值归一化）+ RemoteImage（变体链 + 逐级回退）
 * + 本组件的图标兜底：任何一步失败都还有「这是哪座城市」的图形提示。
 */
export default function CoverThumb({
  src,
  alt,
  className = '',
  variant = 'thumbnail',
}: {
  /** 原始封面地址（可为空 / 相对路径 / 绝对 URL / 裸存储键） */
  src?: string | null
  alt: string
  className?: string
  variant?: 'thumbnail' | 'preview'
}) {
  const url = normalizeCoverUrl(src ?? null)
  const [failed, setFailed] = useState(false)

  // 同一个缩略图节点复用到另一条记录时（切城市/切筛选）重置失败态
  useEffect(() => {
    setFailed(false)
  }, [url])

  if (!url || failed) {
    return (
      <span className={'chm-thumb-fallback ' + className} aria-hidden="true">
        {/* 内联 SVG：小旗插在山脊上，表示「这条记录还没有可显示的封面」 */}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M3 18h18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M6 18V8l5 4 5-6v12" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="17.5" cy="7.5" r="1.6" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
    )
  }

  return (
    <RemoteImage
      src={url}
      alt={alt}
      variant={variant}
      fill
      className={className}
      onFinalError={() => setFailed(true)}
    />
  )
}
