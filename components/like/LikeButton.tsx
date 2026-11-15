'use client'

import { useEffect, useState, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVisitorId } from '@/lib/visitor-id'
import { hapticLight } from '@/lib/mobile/haptics'
import { apiUrl } from '@/lib/api-base'

interface LikeButtonProps {
  targetType: 'post' | 'moment'
  targetId: string
  className?: string
  size?: 'sm' | 'md'
}

interface LikeState {
  count: number
  liked: boolean
}

export default function LikeButton({
  targetType,
  targetId,
  className,
  size = 'md',
}: LikeButtonProps) {
  const [state, setState] = useState<LikeState>({ count: 0, liked: false })
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [popKey, setPopKey] = useState(0)

  const fetchState = useCallback(async (visitorId?: string) => {
    try {
      const query = new URLSearchParams({ targetType, targetId })
      if (visitorId) query.set('visitorId', visitorId)
      const res = await fetch(apiUrl(`/api/likes?${query.toString()}`))
      if (res.ok) {
        const json = await res.json()
        if (json.data) {
          setState(json.data)
        }
      }
    } catch {
      // 忽略网络错误
    } finally {
      setReady(true)
    }
  }, [targetType, targetId])

  useEffect(() => {
    let visitorId: string | undefined
    try {
      visitorId = getVisitorId()
    } catch {
      visitorId = undefined
    }
    fetchState(visitorId)
  }, [fetchState])

  const handleToggle = async () => {
    if (loading) return
    setLoading(true)
    // 乐观更新
    setPopKey((k) => k + 1)
    void hapticLight()
    setState((prev) => ({
      count: prev.liked ? Math.max(0, prev.count - 1) : prev.count + 1,
      liked: !prev.liked,
    }))
    try {
      const visitorId = getVisitorId()
      const res = await fetch(apiUrl('/api/likes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, visitorId }),
      })
      if (res.ok) {
        const json = await res.json()
        if (json.data) setState(json.data)
      } else {
        // 失败回滚
        fetchState(visitorId)
      }
    } catch {
      fetchState()
    } finally {
      setLoading(false)
    }
  }

  const sm = size === 'sm'

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading || !ready}
      aria-pressed={state.liked}
      title={state.liked ? '取消点赞' : '点赞'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full transition-all select-none',
        sm ? 'min-h-[40px] px-3.5 text-[12px]' : 'min-h-[44px] px-4 text-[13px]',
        state.liked
          ? 'bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)] border border-[var(--m-line-strong)]'
          : 'bg-[var(--m-surface-2)] text-[var(--m-muted)] border border-transparent',
        loading && 'opacity-60 cursor-wait',
        className
      )}
    >
      <Heart
        key={popKey}
        className={cn(
          'transition-transform',
          sm ? 'w-3.5 h-3.5' : 'w-4 h-4',
          state.liked && 'fill-[var(--m-accent)] scale-110',
          state.liked && popKey > 0 && 'm-pop'
        )}
      />
      <span className="tabular-nums">{state.count > 0 ? state.count : '点赞'}</span>
    </button>
  )
}
