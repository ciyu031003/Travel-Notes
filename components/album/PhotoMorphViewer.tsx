'use client'

import { useCallback, useMemo, useState } from 'react'
import { X, MessageCircle, MapPin } from 'lucide-react'
import MorphSlider from './morphslider/MorphSlider'

interface PhotoMorphViewerProps {
  images: string[]
  initialIndex: number
  onClose: () => void
  onChat?: (image: string, index: number) => void
  cityName?: string
}

/**
 * 同城 Morph 查看器：
 * - 基于 MorphSlider（WebGL/GSAP）实现形变切换
 * - 打开时自动"连锁"到同一个城市的所有图片（images = 该城市的全部照片）
 * - 保留留言入口：点击"留言"携带当前照片进入现有聊天视图
 * - 顶部关闭 / 底部计数 + 城市标识 + 留言按钮
 */
export default function PhotoMorphViewer({
  images,
  initialIndex,
  onClose,
  onChat,
  cityName,
}: PhotoMorphViewerProps) {
  const [current, setCurrent] = useState(initialIndex)

  // 稳定 items，避免 MorphSlider 在 index 变化时重建 WebGL 引擎
  const items = useMemo(
    () => images.map((image, i) => ({ image, caption: `${cityName || '相册'} · ${i + 1}` })),
    [images, cityName],
  )

  const goChat = useCallback(() => {
    const image = images[current]
    if (image) onChat?.(image, current)
  }, [current, images, onChat])

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={cityName ? `${cityName} 照片查看器` : '照片查看器'}
      onClick={onClose}
    >
      {/* 顶部：关闭 */}
      <div
        className="absolute top-3 right-3 z-20 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-album-text1 border border-white/15 hover:bg-white/20 transition-colors"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 底部：城市 + 计数 + 留言 */}
      <div
        className="absolute bottom-4 inset-x-0 z-20 flex flex-col items-center gap-2 px-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {cityName && (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wider text-album-text1 border border-white/15">
            <MapPin className="h-3 w-3" />
            {cityName}
          </p>
        )}
        <p className="text-sm tabular-nums text-album-text1">
          {(current >= 0 ? current + 1 : 1)} / {images.length}
        </p>
        <button
          type="button"
          onClick={goChat}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-bold text-album-text1 hover:bg-white/20 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          给这张照片留言
        </button>
      </div>

      {/* 主体：MorphSlider 形变切换 */}
      <div
        className="relative h-[86vh] max-h-[88vh] w-full max-w-[92vw] overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <MorphSlider
          items={items}
          startIndex={initialIndex}
          transition="melt"
          showCaptions={false}
          showIndicators={true}
          showControls={true}
          radius={16}
          onIndexChange={setCurrent}
        />
      </div>
    </div>
  )
}
