'use client'

import Image from 'next/image'
import { Heart, MessageCircle, Bookmark, MapPin, ImageIcon } from 'lucide-react'
import SocialAvatar from '@/components/social/SocialAvatar'
import { cn } from '@/lib/utils'

export interface SocialFilmAuthor {
  name: string
  avatar?: string | null
}

interface SocialFilmCardProps {
  coverUrl?: string | null
  cityName?: string | null
  title?: string
  summary?: string | null
  dateRange?: string
  dayCount?: number
  photoCount?: number
  location?: string | null
  author?: SocialFilmAuthor | null
  stats?: { likes?: number; comments?: number; bookmarks?: number }
  variant?: 'hero' | 'card'
  frame?: 'wide' | 'portrait' | 'square' | 'landscape'
  onOpen?: () => void
  className?: string
}

const FRAME = {
  wide: 'aspect-[16/10]',
  portrait: 'aspect-[4/5]',
  square: 'aspect-square',
  landscape: 'aspect-[4/3]',
}

/**
 * 旅行故事卡片（Stage 3 视觉统一）：
 * 照片第一，其次标题 / 地点日期 / 作者 / 正文，互动最弱；弱边框，不做统一圆角白卡。
 */
export default function SocialFilmCard({
  coverUrl,
  cityName,
  title,
  summary,
  dateRange,
  dayCount,
  photoCount,
  location,
  author,
  stats,
  variant = 'card',
  frame = 'portrait',
  onOpen,
  className,
}: SocialFilmCardProps) {
  const Tag = onOpen ? 'button' : 'div'

  const statsNode = (
    <div className="flex items-center gap-3 text-[var(--social-muted)]">
      {stats?.likes !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums"><Heart className="h-3.5 w-3.5" />{stats.likes}</span>
      )}
      {stats?.comments !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums"><MessageCircle className="h-3.5 w-3.5" />{stats.comments}</span>
      )}
      {stats?.bookmarks !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums"><Bookmark className="h-3.5 w-3.5" />{stats.bookmarks}</span>
      )}
    </div>
  )

  const cover = (aspectClass: string) => (
    <div className={cn('relative w-full overflow-hidden bg-[var(--social-surface2)]', aspectClass)}>
      {coverUrl ? (
        <Image src={coverUrl} alt={title || cityName || '旅行封面'} fill sizes={variant === 'hero' ? '100vw' : '(max-width: 768px) 100vw, 33vw'} className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--social-faint)]"><ImageIcon className="h-8 w-8" /></div>
      )}
    </div>
  )

  if (variant === 'hero') {
    return (
      <Tag type={onOpen ? 'button' : undefined} onClick={onOpen}
        className={cn('group relative block w-full overflow-hidden rounded-[2rem] bg-[var(--social-surface)] text-left ring-1 ring-[var(--social-line)]', className)}>
        {cover('aspect-[16/10]')}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-[#050505]/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          {cityName && <div className="text-xs font-medium tracking-[0.22em] text-[var(--social-accent)] uppercase">{cityName}</div>}
          {title && <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-[var(--social-text)] sm:text-3xl">{title}</h2>}
          {summary && <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-[var(--social-muted)]">{summary}</p>}
          <div className="mt-4 flex items-center justify-between gap-3">
            {author ? <div className="flex min-w-0 items-center gap-2"><SocialAvatar name={author.name} avatarUrl={author.avatar} size={28} /><span className="truncate text-sm text-[var(--social-muted)]">{author.name}</span></div> : <span />}
            {statsNode}
          </div>
        </div>
      </Tag>
    )
  }

  return (
    <Tag type={onOpen ? 'button' : undefined} onClick={onOpen}
      className={cn('group block w-full overflow-hidden rounded-[1.4rem] bg-[var(--social-surface-90)] text-left ring-1 ring-[var(--social-line)] transition duration-300',
        onOpen && 'hover:-translate-y-0.5 hover:bg-[var(--social-surface)] hover:ring-[var(--social-line-strong)]', className)}>
      {cover(FRAME[frame])}
      <div className="space-y-2 p-4">
        {cityName && <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--social-accent)]"><MapPin className="h-3 w-3" />{cityName}</div>}
        {title && <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--social-text)]">{title}</h3>}
        {summary && <p className="line-clamp-2 text-sm leading-relaxed text-[var(--social-muted)]">{summary}</p>}
        <div className="flex items-center gap-x-2 gap-y-1 text-xs text-[var(--social-faint)]">
          {dateRange && <span>{dateRange}</span>}
          {dayCount !== undefined && <span>· {dayCount} 天</span>}
          {photoCount !== undefined && <span>· {photoCount} 张</span>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--social-line)] pt-3">
          {author ? <div className="flex min-w-0 items-center gap-2"><SocialAvatar name={author.name} avatarUrl={author.avatar} size={24} /><span className="truncate text-xs text-[var(--social-muted)]">{author.name}</span></div> : <span />}
          {statsNode}
        </div>
      </div>
    </Tag>
  )
}
