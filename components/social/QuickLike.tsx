'use client'

import { useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import { toggleLike } from '@/lib/modules/offline/social-write'

interface QuickLikeProps {
  postId: number
  likeCount: number
  liked?: boolean
  /**
   * 未登录时传入登录地址（如 `/login?redirect=%2Fcircle`）。
   * 传入后点击不再写库，而是引导登录 —— 与旅行圈「访客可看、互动需登录」的规则一致，
   * 避免游客点一下只看到按钮回滚、却不知道为什么。
   */
  loginHref?: string
  /** on-media：压在照片上（需要遮罩保证可读）；on-surface：普通卡片面上 */
  variant?: 'on-media' | 'on-surface'
  className?: string
}

/**
 * 快捷点赞（列表卡片上的点赞入口）
 *
 * 为什么需要：旅行圈此前**只能进详情页才能点赞** —— 卡片上的 ♡ 数字是只读的 `<span>`。
 * 浏览别人的旅行记录时，点赞要多跳一次页面。
 *
 * 交互（参考 Uiverse「Buttons」分类的浮动胶囊 + 按压回弹，按本项目规范重写）：
 *  · 触达 ≥44px；按压 scale；点赞时心形弹一下（`.m-pop`，一次性动画）
 *  · 乐观更新 + 失败回滚；原生壳走离线队列（`toggleLike` 已封装）
 *  · 状态自持（与 `SocialBar` 一致），父组件不需要维护点赞状态
 *  · 未登录 → `loginHref` 引导登录，不产生无效请求
 */
export default function QuickLike({
  postId,
  likeCount,
  liked = false,
  loginHref,
  variant = 'on-media',
  className,
}: QuickLikeProps) {
  const router = useRouter()
  const [isLiked, setIsLiked] = useState(liked)
  const [count, setCount] = useState(likeCount)
  const [pending, setPending] = useState(false)
  const [popKey, setPopKey] = useState(0)

  const handleClick = async (e: MouseEvent) => {
    // 卡片本身是一个覆盖整块的「打开详情」按钮，这里必须阻止冒泡，否则点赞会顺带跳页
    e.preventDefault()
    e.stopPropagation()
    if (pending) return

    void hapticLight()

    if (loginHref) {
      router.push(loginHref)
      return
    }

    const prevLiked = isLiked
    const prevCount = count
    const next = !prevLiked

    // 乐观更新
    setIsLiked(next)
    setCount(Math.max(0, prevCount + (next ? 1 : -1)))
    if (next) setPopKey((k) => k + 1)
    setPending(true)

    try {
      const r = await toggleLike(postId, next)
      if (!r.ok) {
        setIsLiked(prevLiked)
        setCount(prevCount)
      }
    } catch {
      setIsLiked(prevLiked)
      setCount(prevCount)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isLiked}
      aria-label={loginHref ? '登录后点赞' : isLiked ? '取消点赞' : '点赞'}
      className={cn(
        'm-pressable inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums',
        'backdrop-blur-md transition-colors',
        variant === 'on-media'
          ? 'bg-black/45 text-white ring-1 ring-white/25'
          : 'bg-[var(--social-surface)] text-[var(--social-muted)] ring-1 ring-[var(--social-line)]',
        isLiked && 'text-travel-bloom',
        pending && 'opacity-80',
        className,
      )}
    >
      <Icon
        icon={Heart}
        size="sm"
        key={popKey}
        className={cn('transition-transform', isLiked && 'fill-current', isLiked && popKey > 0 && 'm-pop')}
      />
      <span>{count}</span>
    </button>
  )
}
