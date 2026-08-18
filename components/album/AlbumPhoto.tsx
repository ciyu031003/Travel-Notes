'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface AlbumPhotoProps {
  src: string
  alt?: string
  badge?: React.ReactNode
  aspect?: 'square' | '4/5' | '4/3' | '16/9'
  sizes?: string
  priority?: boolean
  className?: string
  onClick?: () => void
}

const ASPECT_CLASS: Record<NonNullable<AlbumPhotoProps['aspect']>, string> = {
  square: 'aspect-square',
  '4/5': 'aspect-[4/5]',
  '4/3': 'aspect-[4/3]',
  '16/9': 'aspect-[16/9]',
}

/**
 * 相册照片单元：固定宽高比 + next/image + 可选单个角标。
 * 常驻角标每张照片最多 1 个（同步状态或 Day 序号），由调用方传入。
 */
export default function AlbumPhoto({
  src,
  alt = '',
  badge,
  aspect = 'square',
  sizes = '(max-width: 768px) 50vw, 25vw',
  priority = false,
  className,
  onClick,
}: AlbumPhotoProps) {
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick && alt ? alt : undefined}
      className={cn(
        'group relative block w-full overflow-hidden rounded-lg bg-album-bg2',
        ASPECT_CLASS[aspect],
        onClick && 'cursor-pointer text-left',
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {badge ? <span className="absolute right-1.5 top-1.5 z-10">{badge}</span> : null}
    </Tag>
  )
}
