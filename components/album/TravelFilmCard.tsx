'use client'

import Image from 'next/image'
import { Bookmark, Heart, ImageIcon, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TravelFilmStats {
  likes?: number
  comments?: number
  bookmarks?: number
}

interface TravelFilmAuthor {
  name: string
  avatar?: string
}

interface TravelFilmCardProps {
  coverUrl?: string
  cityName?: string
  title?: string
  dateRange?: string
  dayCount?: number
  photoCount?: number
  location?: string
  author?: TravelFilmAuthor
  stats?: TravelFilmStats
  variant?: 'card' | 'hero' | 'strip'
  /** 封面右上角像素风徽章（如旅行类型：独旅/家庭/朋友…） */
  badge?: string
  onOpen?: () => void
  /** 卡片色调：dark = 相册暗色像素系（默认）；light = 亮色编辑系 */
  tone?: 'dark' | 'light'
  className?: string
}

/**
 * Travel Film 统一卡片：相册封面 / 公开旅行 / 旅行圈 Feed / 用户主页共用。
 * 照片是主体，像素符号（城市名/日期/DAY）只做辅助信息。
 * onOpen 为空时渲染为静态卡片（用于仅展示的归档场景）。
 * tone 允许不同表面（暗色相册 / 亮色编辑）原生适配，避免设计系统漂移。
 */
export default function TravelFilmCard({
  coverUrl,
  cityName,
  title,
  dateRange,
  dayCount,
  photoCount,
  location,
  author,
  stats,
  variant = 'card',
  badge,
  onOpen,
  tone = 'dark',
  className,
}: TravelFilmCardProps) {
  // tone 语义映射：dark 沿用相册像素 token；light 映射亮色编辑 token
  const t = tone === 'light'
    ? {
        root: 'border-travel-dim bg-white',
        surface: 'border-travel-dim bg-white',
        cover: 'bg-travel-sakura/60',
        placeholder: 'bg-travel-mist/40',
        placeholderIcon: 'text-travel-ink/40',
        title: 'text-travel-inkStrong',
        meta: 'font-sans text-xs text-travel-accent',
        metaDate: 'font-mono text-travel-ink/60',
        sub: 'text-travel-ink/70',
        badge: 'border-travel-dim bg-travel-cream/95 text-travel-accent font-sans',
        nav: 'group-hover:border-travel-accent/40 text-travel-accent',
      }
    : {
        root: 'border-white/10 bg-album-surface',
        surface: 'border-white/10 bg-album-surface',
        cover: 'bg-album-bg2',
        placeholder: 'bg-pixel-panel2',
        placeholderIcon: 'text-album-text3',
        title: 'text-album-text1',
        meta: 'font-zpix text-xs text-album-accent',
        metaDate: 'font-mono text-album-text2',
        sub: 'text-album-text2',
        badge: 'border-pixel-line bg-black/75 text-album-accent font-zpix',
        nav: 'group-hover:border-album-accent/40 text-album-accent',
      }

  const Tag = onOpen ? 'button' : 'div'

  const statsNode = (
    <div className="flex items-center gap-3 text-album-text2">
      {stats?.likes !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums">
          <Heart className="h-3.5 w-3.5" />
          {stats.likes}
        </span>
      )}
      {stats?.comments !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums">
          <MessageCircle className="h-3.5 w-3.5" />
          {stats.comments}
        </span>
      )}
      {stats?.bookmarks !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums">
          <Bookmark className="h-3.5 w-3.5" />
          {stats.bookmarks}
        </span>
      )}
    </div>
  )

  const cover = (aspectClass: string) => (
    <div className={cn('relative w-full overflow-hidden', t.cover, aspectClass)}>
      {badge && (
        <span className={cn('absolute right-2 top-2 z-10 rounded-full border px-2 py-0.5 text-xs font-bold shadow-[2px_2px_0_rgba(0,0,0,0.6)]', t.badge)}>
          {badge}
        </span>
      )}
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={title || cityName || '旅行封面'}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className={cn('absolute inset-0 flex items-center justify-center', t.placeholder)}>
          <ImageIcon className={cn('h-8 w-8', t.placeholderIcon)} />
        </div>
      )}
    </div>
  )

  const meta = (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', t.meta)}>
      {cityName && <span>{cityName}</span>}
      {dateRange && <span className={t.metaDate}>{dateRange}</span>}
      {dayCount !== undefined && <span>DAY {dayCount}</span>}
      {photoCount !== undefined && <span>{photoCount} 张</span>}
    </div>
  )

  if (variant === 'strip') {
    return (
      <Tag
        type={onOpen ? 'button' : undefined}
        onClick={onOpen}
        className={cn(
          'group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all',
          t.surface,
          onOpen && 'hover:-translate-y-0.5',
          onOpen && t.nav,
          className
        )}
      >
        <div className={cn('relative h-20 w-28 shrink-0 overflow-hidden rounded-xl', t.cover)}>
          {coverUrl ? (
            <Image src={coverUrl} alt={title || cityName || '旅行封面'} fill sizes="112px" className="object-cover" />
          ) : (
            <div className={cn('absolute inset-0 flex items-center justify-center', t.placeholder)}>
              <ImageIcon className={cn('h-5 w-5', t.placeholderIcon)} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {meta}
          {title && <h3 className={cn('mt-1 truncate text-sm font-semibold', t.title)}>{title}</h3>}
          {author && <p className={cn('mt-1 truncate text-xs', t.sub)}>{author.name}</p>}
        </div>
        {statsNode}
      </Tag>
    )
  }

  if (variant === 'hero') {
    return (
      <Tag
        type={onOpen ? 'button' : undefined}
        onClick={onOpen}
        className={cn('group relative block w-full overflow-hidden rounded-3xl text-left', className)}
      >
        {cover('aspect-[16/9]')}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          {meta}
          {title && <h2 className={cn('mt-1 text-lg font-bold sm:text-xl', t.title)}>{title}</h2>}
          {author && (
            <div className="mt-2 flex items-center gap-2">
              {author.avatar ? (
                <Image src={author.avatar} alt={author.name} width={24} height={24} className="rounded-full object-cover" />
              ) : null}
              <span className="text-xs text-album-text2">{author.name}</span>
            </div>
          )}
        </div>
      </Tag>
    )
  }

  return (
    <Tag
      type={onOpen ? 'button' : undefined}
      onClick={onOpen}
      className={cn(
        'group block w-full overflow-hidden rounded-2xl border text-left transition-all',
        t.root,
        onOpen && 'hover:-translate-y-0.5',
        onOpen && t.nav,
        className
      )}
    >
      {cover('aspect-[4/3]')}
      <div className="space-y-1.5 p-3.5">
        {meta}
        {title && <h3 className={cn('truncate text-sm font-semibold', t.title)}>{title}</h3>}
        {location && <p className={cn('truncate text-xs', t.sub)}>{location}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {author && (
            <div className="flex min-w-0 items-center gap-1.5">
              {author.avatar ? (
                <Image src={author.avatar} alt={author.name} width={20} height={20} className="rounded-full object-cover" />
              ) : null}
              <span className={cn('truncate text-xs', t.sub)}>{author.name}</span>
            </div>
          )}
          {statsNode}
        </div>
      </div>
    </Tag>
  )
}
