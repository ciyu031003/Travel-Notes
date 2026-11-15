'use client'

import { forwardRef, useImperativeHandle, useState, useEffect, useCallback } from 'react'
import { Sparkles, Loader2, Inbox, Quote } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { formatDate } from '@/lib/utils'
import LikeButton from '@/components/like/LikeButton'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalMoments } from '@/lib/modules/offline/moment-read'
import { SkeletonCard } from '@/components/mobile/Skeleton'
import { Stagger } from '@/components/mobile/Stagger'

export interface MomentItem {
  id: number | string
  content: string
  tags: string[] | null
  createdAt: string
}

interface MomentsResponse {
  data?: {
    data?: MomentItem[]
    total?: number
    page?: number
    hasMore?: boolean
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatDate(dateStr)
}

export interface MomentTimelineHandle {
  /** 下拉刷新：重拉第一页（列表保持可见，成功后原位替换） */
  reload: () => Promise<void>
}

const MomentTimeline = forwardRef<MomentTimelineHandle, { limit?: number }>(function MomentTimeline({ limit = 20 }, ref) {
  const [moments, setMoments] = useState<MomentItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (targetPage: number, append: boolean) => {
    if (append) setLoadingMore(true)
    try {
      const result = await readWithFallback<MomentsResponse>(
        async () => {
          const res = await fetch(apiUrl(`/api/moments?page=${targetPage}&pageSize=${limit}`), { credentials: 'include', cache: 'no-cache' })
          if (!res.ok) throw new Error('http ' + res.status)
          return (await res.json()) as MomentsResponse
        },
        async () => {
          const local = await readLocalMoments()
          if (local == null) return null
          return { data: { data: local, total: local.length, hasMore: false } } as MomentsResponse
        },
      )
      const json = result.data
      const data = json.data?.data || []
      setMoments((prev) => (append ? [...prev, ...data] : data))
      setHasMore(!!json.data?.hasMore)
      setPage(targetPage)
    } catch {
      // 忽略错误
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [limit])

  useEffect(() => {
    load(1, false)
  }, [load])

  const loadMore = () => load(page + 1, true)

  useImperativeHandle(ref, () => ({
    reload: () => load(1, false),
  }), [load])

  if (loading) {
    return (
      <>
        <div className="hidden flex-col items-center justify-center py-16 text-travel-sand/70 md:flex dark:text-shell-faint">
          <Icon icon={Loader2} size="md" className="animate-spin mb-3" />
          <p className="text-sm">加载中...</p>
        </div>
        <div className="space-y-4 md:hidden">
          {[0, 1, 2].map((index) => <SkeletonCard key={index} />)}
        </div>
      </>
    )
  }

  if (moments.length === 0) {
    return (
      <div className="m2-card flex flex-col items-center justify-center border-dashed px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
          <Icon icon={Inbox} size="md" />
        </span>
        <p className="mt-4 text-[14px] font-semibold text-[var(--m-text)]">
          还没有碎碎念
        </p>
        <p className="mt-1.5 text-[12px] text-[var(--m-muted)]">
          把脑海里一闪而过的念头留在这里吧
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Stagger className="space-y-4" delayBase={60} step={30}>
        {moments.map((moment, idx) => (
          <div key={moment.id} className="group relative pl-8">
          {/* 时间线竖线 + 节点 */}
          {idx < moments.length - 1 && (
            <span className="absolute left-[9px] top-9 bottom-[-18px] w-px bg-gradient-to-b from-[var(--m-accent)] via-[var(--m-line-strong)] to-transparent" />
          )}
          <span className="absolute left-0 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--m-grad-cta)] shadow-[0_4px_12px_-4px_rgba(184,63,99,0.5)]">
            <Icon icon={Sparkles} size="sm" tone="inverse" />
          </span>

          <div className="m2-card relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 active:scale-[0.98]">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[radial-gradient(closest-side,rgba(231,111,145,0.14),transparent)]" />
            <Icon icon={Quote} size="sm" className="relative mb-2 text-[var(--m-accent)]" />
            <p className="relative whitespace-pre-wrap break-words text-[14px] leading-7 text-[var(--m-text)]">
              {moment.content}
            </p>
            <div className="relative mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-[var(--m-faint)]">
                  {formatRelativeTime(moment.createdAt)}
                </span>
                {moment.tags && moment.tags.length > 0 && (
                  <span className="flex gap-1.5 flex-wrap">
                    {moment.tags.map((tag) => (
                      <span
                        key={tag}
                        className="m2-pill m2-pill-pink"
                      >
                        #{tag}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <LikeButton targetType="moment" targetId={String(moment.id)} size="sm" />
            </div>
          </div>
          </div>
        ))}
      </Stagger>

      {hasMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="m-btn m-btn-secondary min-h-[44px] px-5 text-[13px] disabled:opacity-50"
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  )
})

export default MomentTimeline


