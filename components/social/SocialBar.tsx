'use client'

import { useState } from 'react'
import { Heart, MessageCircle, Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'

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
 * 社交互动栏（Stage 2.4）：点赞 / 评论 / 收藏。
 * 图标 + 数字（tabular-nums），乐观更新 + 失败回滚；点击 scale 1→0.85→1（active:scale-90）。
 * 双变体：on-dark（album 玻璃暗色，旅行圈默认）/ on-light（travel 暖色）。
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

  const dark = variant === 'on-dark'

  const toggleLike = async () => {
    const prevLiked = isLiked
    const prevCount = likes
    const next = !prevLiked
    setIsLiked(next)
    setLikes(Math.max(0, prevCount + (next ? 1 : -1)))
    try {
      const res = await fetch('/api/social/posts/' + postId + '/like', { method: next ? 'POST' : 'DELETE' })
      if (res.ok) {
        const json = await res.json()
        if (json.data) { setLikes(json.data.likeCount); setIsLiked(json.data.liked) }
      } else {
        setIsLiked(prevLiked); setLikes(prevCount)
      }
    } catch { setIsLiked(prevLiked); setLikes(prevCount) }
  }

  const toggleFavorite = async () => {
    const prevFav = isFavorited
    const prevCount = favorites
    const next = !prevFav
    setIsFavorited(next)
    setFavorites(Math.max(0, prevCount + (next ? 1 : -1)))
    try {
      const res = await fetch('/api/social/posts/' + postId + '/favorite', { method: next ? 'POST' : 'DELETE' })
      if (res.ok) {
        const json = await res.json()
        if (json.data) { setFavorites(json.data.favoriteCount); setIsFavorited(json.data.favorited) }
      } else {
        setIsFavorited(prevFav); setFavorites(prevCount)
      }
    } catch { setIsFavorited(prevFav); setFavorites(prevCount) }
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm tabular-nums transition-all active:scale-90 select-none'
  const idle = dark ? 'text-album-text2 hover:text-album-text1' : 'text-travel-ink/60 hover:text-travel-ink'
  const chip = dark ? 'bg-white/5 border border-white/10' : 'bg-white border border-travel-line'

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <button type="button" onClick={toggleLike} aria-pressed={isLiked}
        className={cn(btn, chip, isLiked ? 'text-travel-accent' : idle)}>
        <Heart className={cn('h-4 w-4', isLiked && 'fill-current')} />
        <span>{likes}</span>
      </button>

      <button type="button" onClick={onOpenComments}
        className={cn(btn, chip, idle)}>
        <MessageCircle className="h-4 w-4" />
        <span>{commentCount}</span>
      </button>

      <button type="button" onClick={toggleFavorite} aria-pressed={isFavorited}
        className={cn(btn, chip, isFavorited ? 'text-travel-accent' : idle)}>
        <Bookmark className={cn('h-4 w-4', isFavorited && 'fill-current')} />
        <span>{favorites}</span>
      </button>
    </div>
  )
}
