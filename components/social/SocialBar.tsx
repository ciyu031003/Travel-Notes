'use client'

import { useState } from 'react'
import { Heart, MessageCircle, Bookmark, Share2, Check } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { cn } from '@/lib/utils'
import { toggleLike as offlineToggleLike, toggleFavorite as offlineToggleFavorite } from '@/lib/modules/offline/social-write'
import { hapticLight } from '@/lib/mobile/haptics'
import { toast } from '@/lib/mobile/toast-store'
import { circlePostHref } from '@/lib/routes'

interface SocialBarProps {
  postId: number
  likeCount: number
  favoriteCount: number
  commentCount: number
  liked?: boolean
  favorited?: boolean
  onOpenComments?: () => void
  variant?: 'on-dark' | 'on-light'
  className?: string
}

/**
 * 社交互动栏（Stage 2.4）：点赞 / 评论 / 收藏 / 分享。
 * 图标 + 数字（tabular-nums），乐观更新 + 失败回滚；点击 scale 1→0.85→1（active:scale-90）。
 * 双变体：on-dark（album 玻璃暗色，旅行圈默认）/ on-light（travel 暖色）。
 *
 * R2 补上「分享」：之前只有赞/评/藏，用户想把这趟旅行发给朋友**没有任何入口**。
 * 优先 `navigator.share`（安卓壳/移动浏览器原生分享面板），不支持则复制链接。
 */
export default function SocialBar({
  postId,
  likeCount,
  favoriteCount,
  commentCount,
  liked = false,
  favorited = false,
  onOpenComments,
  variant = 'on-dark',
  className,
}: SocialBarProps) {
  const [likes, setLikes] = useState(likeCount)
  const [isLiked, setIsLiked] = useState(liked)
  const [favorites, setFavorites] = useState(favoriteCount)
  const [isFavorited, setIsFavorited] = useState(favorited)
  const [shared, setShared] = useState(false)

  const dark = variant === 'on-dark'

  const toggleLike = async () => {
    void hapticLight()
    const prevLiked = isLiked
    const prevCount = likes
    const next = !prevLiked
    setIsLiked(next)
    setLikes(Math.max(0, prevCount + (next ? 1 : -1)))
    const r = await offlineToggleLike(postId, next)
    if (!r.ok) { setIsLiked(prevLiked); setLikes(prevCount) }
  }

  const toggleFavorite = async () => {
    void hapticLight()
    const prevFav = isFavorited
    const prevCount = favorites
    const next = !prevFav
    setIsFavorited(next)
    setFavorites(Math.max(0, prevCount + (next ? 1 : -1)))
    const r = await offlineToggleFavorite(postId, next)
    if (!r.ok) { setIsFavorited(prevFav); setFavorites(prevCount) }
  }

  /** 分享：原生分享面板 → 复制链接兜底。两者都不可用时明确告知，不静默失败 */
  const share = async () => {
    void hapticLight()
    const path = circlePostHref(postId) ?? `/circle/${postId}`
    const url = typeof window !== 'undefined' ? new URL(path, window.location.origin).toString() : path
    const payload = { title: '行迹 · 旅行故事', text: '看看这趟旅行', url }

    try {
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator) : undefined
      if (nav?.share) {
        await nav.share(payload)
        setShared(true)
        window.setTimeout(() => setShared(false), 1600)
        return
      }
    } catch (e) {
      // 用户在原生面板里取消 → 不算失败，直接返回
      if (e instanceof Error && e.name === 'AbortError') return
    }

    try {
      await navigator.clipboard.writeText(url)
      setShared(true)
      toast.success('链接已复制，发给朋友吧')
      window.setTimeout(() => setShared(false), 1600)
    } catch {
      toast.error('复制失败，请手动复制地址栏链接')
    }
  }

  const btn = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-2 text-sm tabular-nums transition-all active:scale-90 select-none'
  const idle = dark ? 'text-[var(--social-muted)] hover:text-[var(--social-text)]' : 'text-travel-ink/60 hover:text-travel-ink'
  const chip = dark ? 'bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]' : 'bg-white border border-travel-line'

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <button type="button" onClick={toggleLike} aria-pressed={isLiked} aria-label="点赞"
        className={cn(btn, chip, isLiked ? 'text-travel-accent' : idle)}>
        <Icon icon={Heart} size="sm" className={cn(isLiked && 'fill-current')} />
        <span>{likes}</span>
      </button>

      <button type="button" onClick={onOpenComments} aria-label="评论"
        className={cn(btn, chip, idle)}>
        <Icon icon={MessageCircle} size="sm" />
        <span>{commentCount}</span>
      </button>

      <button type="button" onClick={toggleFavorite} aria-pressed={isFavorited} aria-label="收藏"
        className={cn(btn, chip, isFavorited ? 'text-travel-accent' : idle)}>
        <Icon icon={Bookmark} size="sm" className={cn(isFavorited && 'fill-current')} />
        <span>{favorites}</span>
      </button>

      <button type="button" onClick={share} aria-label="分享" data-testid="share-button"
        className={cn(btn, chip, shared ? 'text-travel-accent' : idle)}>
        <Icon icon={shared ? Check : Share2} size="sm" />
        <span>{shared ? '已分享' : '分享'}</span>
      </button>
    </div>
  )
}
