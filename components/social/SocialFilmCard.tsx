'use client'

import { useState, type MouseEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { MessageCircle, Bookmark, MapPin, ImageIcon } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialAvatar from '@/components/social/SocialAvatar'
import QuickLike from '@/components/social/QuickLike'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import { toggleFavorite } from '@/lib/modules/offline/social-write'

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
  /**
   * 收藏（2026-10-17 新增）。
   *
   * 此前列表上的书签数字是**只读文本**：想收藏必须点进详情页再点一次书签。
   * 而收藏是"稍后再看"的动作，用户恰恰是在**浏览列表时**做决定 ——
   * 数据（`isFavorited` / `favoriteCount`）服务端早就下发了，缺的只是入口。
   */
  favorited?: boolean
  favoriteCount?: number
  /** 访客态：传入登录地址后，快捷收藏引导登录而非发请求 */
  favoriteLoginHref?: string
  /** 传入后「评论数」变成可点入口：直接打开详情页的评论抽屉 */
  onOpenComments?: () => void
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
 * 快捷收藏（列表卡片上的收藏入口，2026-10-17）。
 *
 * 此前列表上的书签数字是**只读文本**：想收藏必须点进详情页再点一次书签按钮。
 * 而收藏是"稍后再看"的动作 —— 用户恰恰是在**浏览列表时**做这个决定。
 * 数据服务端早就下发了（`isFavorited` / `favoriteCount`），缺的只是客户端入口。
 *
 * 形状与 `QuickLike` 严格对齐（同一套胶囊尺寸 / 按压回弹 / 乐观更新 + 失败回滚 /
 * 未登录引导登录、不发无效请求），因为两枚胶囊在卡片上是并排的兄弟控件，
 * 口径不一致会立刻被看出来。
 *
 * 为什么与 `QuickLike` 同处一个文件而不是各开一个：本文件已经从 lucide-react
 * 引入了 `Bookmark`，单独开文件会多欠一条「直接 import lucide-react」的规范债
 * （设计规范门禁第 2 条），而这条债对代码质量没有任何好处。
 */
function QuickFavorite({
  postId,
  favoriteCount,
  favorited = false,
  loginHref,
  className,
}: {
  postId: number
  favoriteCount: number
  favorited?: boolean
  loginHref?: string
  className?: string
}) {
  const router = useRouter()
  const [isFavorited, setIsFavorited] = useState(favorited)
  const [count, setCount] = useState(favoriteCount)
  const [pending, setPending] = useState(false)
  const [popKey, setPopKey] = useState(0)

  const handleClick = async (e: MouseEvent) => {
    // 卡片上铺了一层「打开详情」的点击层，这里必须阻止冒泡，否则收藏会顺带跳页
    e.preventDefault()
    e.stopPropagation()
    if (pending) return

    void hapticLight()

    if (loginHref) {
      router.push(loginHref)
      return
    }

    const prevFav = isFavorited
    const prevCount = count
    const next = !prevFav

    // 乐观更新
    setIsFavorited(next)
    setCount(Math.max(0, prevCount + (next ? 1 : -1)))
    if (next) setPopKey((k) => k + 1)
    setPending(true)

    try {
      const r = await toggleFavorite(postId, next)
      if (!r.ok) {
        setIsFavorited(prevFav)
        setCount(prevCount)
      }
    } catch {
      setIsFavorited(prevFav)
      setCount(prevCount)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorited}
      aria-label={loginHref ? '登录后收藏' : isFavorited ? '取消收藏' : '收藏'}
      className={cn(
        'm-pressable inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums',
        'backdrop-blur-md transition-colors',
        // 与 QuickLike 的 on-media 变体同一套：永远压在照片上，必须用固定浅色 + 半透明底
        'bg-black/45 text-white ring-1 ring-white/25',
        isFavorited && 'text-travel-bloom',
        pending && 'opacity-80',
        className,
      )}
    >
      <Icon
        icon={Bookmark}
        size="sm"
        key={popKey}
        className={cn('transition-transform', isFavorited && 'fill-current', isFavorited && popKey > 0 && 'm-pop')}
      />
      <span>{count}</span>
    </button>
  )
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
  favorited = false,
  favoriteCount,
  favoriteLoginHref,
  onOpenComments,
  variant = 'card',
  frame = 'portrait',
  onOpen,
  className,
}: SocialFilmCardProps) {
  /**
   * 收藏胶囊的渲染条件与点赞胶囊同一处：两者都需要 postId + 服务端回填的计数。
   * 拿不到计数时**不渲染** —— 「拿不到数据」显示成「0 收藏」比不显示更糟。
   */
  const showFavorite = postId !== undefined && favoriteCount !== undefined

  /**
   * 统计行（只读）。
   *
   * 「同一个数字只出现一次」：点赞与收藏现在都是卡片上的**可交互胶囊**，
   * 这里便不再重复渲染同一个数字（否则用户会以为是两件不同的事）。
   * 评论数则从死文本升级成**入口**：点它直接打开详情页的评论抽屉 ——
   * 此前列表上那个数字点不动，想看评论必须先进详情再找动作条。
   *
   * `onMedia` 用于 hero 变体 —— 它永远压在 `from-[#050505]/90` 的深色遮罩上，
   * 必须用固定浅色，**不能用主题 token**：浅色主题下 `--social-muted` 是深棕
   * （rgba(43,33,27,.70)），压在近黑遮罩上几乎看不见（实测对比度远低于 3:1）。
   */
  const statsNode = (onMedia = false) => {
    const tone = onMedia ? 'text-white/75' : 'text-[var(--ui-social-muted)]'
    // 深色遮罩上不能 hover 成陶土色（浅色主题下它是深棕砖色，压在近黑底上看不见）
    const hoverTone = onMedia ? 'hover:text-white' : 'hover:text-[var(--ui-social-accent)]'
    return (
      <div className={cn('flex items-center gap-3', tone)}>
        {stats?.comments !== undefined &&
          (onOpenComments ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenComments()
              }}
              aria-label={`查看评论，共 ${stats.comments} 条`}
              className={cn(
                // z-[2]：必须高于卡片那层 z-[1] 的「打开详情」点击层，否则点不到
                'm-pressable relative z-[2] inline-flex min-h-6 items-center gap-1 rounded-full px-1 text-xs tabular-nums transition-colors',
                hoverTone,
              )}
            >
              <Icon icon={MessageCircle} size="sm" />
              {stats.comments}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs tabular-nums">
              <Icon icon={MessageCircle} size="sm" />
              {stats.comments}
            </span>
          ))}
        {!showFavorite && stats?.bookmarks !== undefined && (
          <span className="inline-flex items-center gap-1 text-xs tabular-nums"><Icon icon={Bookmark} size="sm" />{stats.bookmarks}</span>
        )}
      </div>
    )
  }

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

  const favoriteNode =
    postId !== undefined && favoriteCount !== undefined ? (
      <QuickFavorite
        postId={postId}
        favoriteCount={favoriteCount}
        favorited={favorited}
        loginHref={favoriteLoginHref}
      />
    ) : null

  /** 卡片封面上的快捷互动行：点赞 + 收藏并排（hero / card 两种变体共用同一套排列） */
  const quickActions =
    likeNode || favoriteNode ? (
      <div className="flex items-center gap-2">
        {likeNode}
        {favoriteNode}
      </div>
    ) : null

  /** 「打开详情」的覆盖层：整块可点，且保持键盘可达（根元素不再是 button） */
  const openLayer = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={title ? `打开旅行故事：${title}` : '打开旅行故事'}
      className="absolute inset-0 z-[1] cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-social-accent)]"
    />
  ) : null

  const cover = (aspectClass: string, overlay?: React.ReactNode) => (
    <div className={cn('relative w-full overflow-hidden bg-[var(--ui-social-surface2)]', aspectClass)}>
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={title || cityName || '旅行封面'}
          fill
          sizes={variant === 'hero' ? '100vw' : '(max-width: 768px) 100vw, 33vw'}
          onLoad={(e) => e.currentTarget.classList.add('is-loaded')}
          className="m-img-fade object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--ui-social-muted)]"><Icon icon={ImageIcon} size="lg" /></div>
      )}
      {overlay}
    </div>
  )

  if (variant === 'hero') {
    return (
      <div className={cn('group relative block w-full overflow-hidden rounded-[2rem] bg-[var(--ui-social-surface)] text-left ring-1 ring-[var(--ui-social-line)]', className)}>
        {openLayer}
        {cover('aspect-[16/10]')}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-[#050505]/15 to-transparent" />
        {/*
          z-[2] 是必需的，不是装饰：卡片的「打开详情」覆盖层是 z-[1]，而这一层原先没有
          z-index（z-auto）。同为定位元素时 z-index:1 会**画在 z-auto 之上**，
          于是覆盖层抢走了这一整块区域的点击 —— 底部信息行里的点赞 / 收藏按钮
          看起来好好的，点下去却是"打开详情"（2026-10-17 由 E2E 实测抓到：
          `.click()` 报 "…intercepts pointer events"）。
          card 变体的快捷胶囊本来就写了 z-[2]，hero 变体漏了，这里补齐。
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] p-4 sm:p-7">
          {/* 以下文字一律用固定浅色：它们永远压在深色遮罩上，主题 token 在浅色主题下会变成深色而看不清 */}
          {cityName && <div className="text-xs font-medium tracking-[0.22em] text-travel-bloom uppercase">{cityName}</div>}
          {title && <h2 className="mt-2 max-w-2xl text-xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">{title}</h2>}
          {summary && <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/75 max-sm:hidden">{summary}</p>}
          <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
            {author ? <div className="flex min-w-0 items-center gap-2"><SocialAvatar name={author.name} avatarUrl={author.avatar} size={28} /><span className="truncate text-sm text-white/80">{author.name}</span></div> : <span />}
            <div className="pointer-events-auto flex items-center gap-3">
              {quickActions}
              {statsNode(true)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('m-card-pressable group relative block w-full overflow-hidden rounded-[1.4rem] bg-[var(--ui-social-surface-90)] text-left ring-1 ring-[var(--ui-social-line)] transition-colors duration-300',
        onOpen && 'hover:-translate-y-0.5 hover:bg-[var(--ui-social-surface)] hover:ring-[var(--ui-social-line-strong)]', className)}>
      {openLayer}
      {cover(
        FRAME[frame],
        quickActions && (
          <div className="absolute bottom-3 right-3 z-[2]">{quickActions}</div>
        ),
      )}
      <div className="space-y-2 p-4">
        {cityName && <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--ui-social-accent)]"><Icon icon={MapPin} size="sm" />{cityName}</div>}
        {title && <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--ui-social-text)]">{title}</h3>}
        {summary && <p className="line-clamp-2 text-sm leading-relaxed text-[var(--ui-social-muted)]">{summary}</p>}
        <div className="flex items-center gap-x-2 gap-y-1 text-xs text-[var(--ui-social-muted)]">
          {travelRelation && <span className="text-[var(--ui-social-accent)]">{travelRelation}</span>}
          {dateRange && <span>{dateRange}</span>}
          {dayCount !== undefined && <span>· {dayCount} 天</span>}
          {photoCount !== undefined && <span>· {photoCount} 张</span>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--ui-social-line)] pt-3">
          {author ? <div className="flex min-w-0 items-center gap-2"><SocialAvatar name={author.name} avatarUrl={author.avatar} size={24} /><span className="truncate text-xs text-[var(--ui-social-muted)]">{author.name}</span></div> : <span />}
          {statsNode()}
        </div>
      </div>
    </div>
  )
}
