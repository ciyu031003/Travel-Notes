'use client'

import Image from 'next/image'
import { MessageCircle, Bookmark, MapPin, ImageIcon } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialAvatar from '@/components/social/SocialAvatar'
import QuickLike from '@/components/social/QuickLike'
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
  travelRelation?: string | null
  author?: SocialFilmAuthor | null
  stats?: { likes?: number; comments?: number; bookmarks?: number }
  /** 传入后卡片右下角出现「快捷点赞」入口（不必进详情页即可点赞） */
  postId?: number
  liked?: boolean
  likeCount?: number
  /** 访客态：传入登录地址后，快捷点赞引导登录而非发请求 */
  likeLoginHref?: string
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
 *
 * M5 修订（快捷点赞）：
 *  · **结构修正**：此前 `onOpen` 存在时根元素是 `<button>`，于是任何放在卡片里的互动控件
 *    （点赞按钮）都会变成 `<button>` 嵌套 `<button>` —— 非法 HTML，点击语义也会错乱。
 *    现在根元素固定为 `<div>`，另铺一层绝对定位的 `<button>` 作为「打开详情」的点击/键盘层，
 *    互动控件以更高的 z-index 叠在它之上（z-[2] > z-[1]）。
 *  · **快捷点赞**：卡片封面右下角浮动 ♡（hero 变体放在底部信息行），不必进详情页；
 *    只读的 ♡ 计数从 stats 行移除，避免同一个数字出现两次。
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
  travelRelation,
  author,
  stats,
  postId,
  liked = false,
  likeCount = 0,
  likeLoginHref,
  variant = 'card',
  frame = 'portrait',
  onOpen,
  className,
}: SocialFilmCardProps) {
  /**
   * 只读统计：点赞已改为可交互入口，这里不再重复展示 ♡ 数字。
   *
   * `onMedia` 用于 hero 变体 —— 它永远压在 `from-[#050505]/90` 的深色遮罩上，
   * 必须用固定浅色，**不能用主题 token**：浅色主题下 `--social-muted` 是深棕
   * （rgba(43,33,27,.70)），压在近黑遮罩上几乎看不见（实测对比度远低于 3:1）。
   */
  const statsNode = (onMedia = false) => (
    <div className={cn('flex items-center gap-3', onMedia ? 'text-white/75' : 'text-[var(--social-muted)]')}>
      {stats?.comments !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums"><Icon icon={MessageCircle} size="sm" />{stats.comments}</span>
      )}
      {stats?.bookmarks !== undefined && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums"><Icon icon={Bookmark} size="sm" />{stats.bookmarks}</span>
      )}
    </div>
  )

  const likeNode =
    postId !== undefined ? (
      <QuickLike
        postId={postId}
        likeCount={likeCount}
        liked={liked}
        loginHref={likeLoginHref}
        variant="on-media"
      />
    ) : null

  /** 「打开详情」的覆盖层：整块可点，且保持键盘可达（根元素不再是 button） */
  const openLayer = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={title ? `打开旅行故事：${title}` : '打开旅行故事'}
      className="absolute inset-0 z-[1] cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--social-accent)]"
    />
  ) : null

  const cover = (aspectClass: string, overlay?: React.ReactNode) => (
    <div className={cn('relative w-full overflow-hidden bg-[var(--social-surface2)]', aspectClass)}>
      {coverUrl ? (
        <Image src={coverUrl} alt={title || cityName || '旅行封面'} fill sizes={variant === 'hero' ? '100vw' : '(max-width: 768px) 100vw, 33vw'} className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--social-faint)]"><Icon icon={ImageIcon} size="lg" /></div>
      )}
      {overlay}
    </div>
  )

  if (variant === 'hero') {
    return (
      <div className={cn('group relative block w-full overflow-hidden rounded-[2rem] bg-[var(--social-surface)] text-left ring-1 ring-[var(--social-line)]', className)}>
        {openLayer}
        {cover('aspect-[16/10]')}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-[#050505]/15 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-7">
          {/* 以下文字一律用固定浅色：它们永远压在深色遮罩上，主题 token 在浅色主题下会变成深色而看不清 */}
          {cityName && <div className="text-xs font-medium tracking-[0.22em] text-travel-bloom uppercase">{cityName}</div>}
          {title && <h2 className="mt-2 max-w-2xl text-xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">{title}</h2>}
          {summary && <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/75 max-sm:hidden">{summary}</p>}
          <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
            {author ? <div className="flex min-w-0 items-center gap-2"><SocialAvatar name={author.name} avatarUrl={author.avatar} size={28} /><span className="truncate text-sm text-white/80">{author.name}</span></div> : <span />}
            <div className="pointer-events-auto flex items-center gap-3">
              {likeNode}
              {statsNode(true)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('group relative block w-full overflow-hidden rounded-[1.4rem] bg-[var(--social-surface-90)] text-left ring-1 ring-[var(--social-line)] transition duration-300',
        onOpen && 'hover:-translate-y-0.5 hover:bg-[var(--social-surface)] hover:ring-[var(--social-line-strong)]', className)}>
      {openLayer}
      {cover(
        FRAME[frame],
        likeNode && (
          <div className="absolute bottom-3 right-3 z-[2]">{likeNode}</div>
        ),
      )}
      <div className="space-y-2 p-4">
        {cityName && <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--social-accent)]"><Icon icon={MapPin} size="sm" />{cityName}</div>}
        {title && <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--social-text)]">{title}</h3>}
        {summary && <p className="line-clamp-2 text-sm leading-relaxed text-[var(--social-muted)]">{summary}</p>}
        <div className="flex items-center gap-x-2 gap-y-1 text-xs text-[var(--social-faint)]">
          {travelRelation && <span className="text-[var(--social-accent)]">{travelRelation}</span>}
          {dateRange && <span>{dateRange}</span>}
          {dayCount !== undefined && <span>· {dayCount} 天</span>}
          {photoCount !== undefined && <span>· {photoCount} 张</span>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--social-line)] pt-3">
          {author ? <div className="flex min-w-0 items-center gap-2"><SocialAvatar name={author.name} avatarUrl={author.avatar} size={24} /><span className="truncate text-xs text-[var(--social-muted)]">{author.name}</span></div> : <span />}
          {statsNode()}
        </div>
      </div>
    </div>
  )
}
