'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Loader2, Inbox, Quote } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import LikeButton from '@/components/like/LikeButton'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalMoments } from '@/lib/modules/offline/moment-read'

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

export default function MomentTimeline({ limit = 20 }: { limit?: number }) {
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
          const res = await fetch(apiUrl(`/api/moments?page=${targetPage}&pageSize=${limit}`), { credentials: 'include' })
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-travel-sand/70 dark:text-shell-faint">
        <Loader2 className="w-6 h-6 animate-spin mb-3" />
        <p className="text-sm">加载中...</p>
      </div>
    )
  }

  if (moments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-travel-line/70 bg-white/60 px-6 py-16 text-center dark:border-shell-line dark:bg-shell-surface/50">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-travel-sakura/40 text-travel-accent dark:bg-travel-accent/15 dark:text-travel-accentSoft">
          <Inbox className="h-6 w-6" />
        </span>
        <p className="mt-4 text-sm font-medium text-travel-inkStrong dark:text-shell-text">
          还没有碎碎念
        </p>
        <p className="mt-1.5 text-sm text-travel-sand dark:text-shell-muted">
          把脑海里一闪而过的念头留在这里吧
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {moments.map((moment, idx) => (
        <div key={moment.id} className="group relative pl-8">
          {/* 时间线竖线 + 节点 */}
          {idx < moments.length - 1 && (
            <span className="absolute left-[9px] top-9 bottom-[-18px] w-px bg-gradient-to-b from-travel-bloom/70 via-travel-sakura/50 to-transparent dark:from-travel-accentStrong/40" />
          )}
          <span className="absolute left-0 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-travel-sakura to-travel-bloom shadow-[0_4px_12px_-4px_rgba(168,95,58,0.5)]">
            <Sparkles className="h-2.5 w-2.5 text-white" />
          </span>

          <div className="relative overflow-hidden rounded-[22px] border border-travel-line/70 bg-white/85 p-5 shadow-[0_12px_30px_-24px_rgba(90,102,112,0.35)] transition-all hover:-translate-y-0.5 hover:border-travel-bloom/70 hover:shadow-[0_16px_36px_-24px_rgba(198,122,78,0.45)] dark:border-shell-line dark:bg-shell-surface/85 dark:hover:border-travel-accentStrong/60">
            <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[radial-gradient(closest-side,rgba(228,180,120,0.14),transparent)]" />
            <Quote className="relative mb-2 h-4 w-4 text-travel-bloom/70" />
            <p className="relative whitespace-pre-wrap break-words text-[15px] leading-7 text-travel-ink dark:text-shell-text">
              {moment.content}
            </p>
            <div className="relative mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-travel-sand dark:text-shell-faint">
                  {formatRelativeTime(moment.createdAt)}
                </span>
                {moment.tags && moment.tags.length > 0 && (
                  <span className="flex gap-1.5 flex-wrap">
                    {moment.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-travel-sakura/60 px-2 py-0.5 text-xs text-travel-accent dark:bg-travel-accent/15 dark:text-travel-accentSoft"
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

      {hasMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-travel-sakura/60 px-5 text-sm font-medium text-travel-accent transition-all hover:bg-travel-sakura hover:shadow-sm disabled:opacity-50 dark:bg-travel-accent/15 dark:text-travel-accentSoft dark:hover:bg-travel-accentStrong/30"
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  )
}


