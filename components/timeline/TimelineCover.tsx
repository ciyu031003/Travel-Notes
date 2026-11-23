'use client'

import RemoteImage from '@/components/mobile/RemoteImage'

/**
 * 时间线列表封面（96×80 缩略）。
 * 走 RemoteImage：优先 -thumbnail 变体（480px），旧图无变体时 onError 回退原图，
 * 父容器（h-20 w-24 + relative）已定尺寸，fill 模式不产生 CLS。
 */
export default function TimelineCover({ src, alt }: { src: string; alt: string }) {
  return (
    <RemoteImage
      src={src}
      alt={alt}
      variant="thumbnail"
      width={96}
      height={80}
      fill
      className="transition-transform duration-500 group-hover:scale-110"
    />
  )
}
