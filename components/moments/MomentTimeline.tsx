'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Loader2, Inbox } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import LikeButton from '@/components/like/LikeButton'

export interface MomentItem {
  id: number
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
      const res = await fetch(`/api/moments?page=${targetPage}&pageSize=${limit}`)
      if (res.ok) {
        const json: MomentsResponse = await res.json()
        const data = json.data?.data || []
        setMoments((prev) => (append ? [...prev, ...data] : data))
        setHasMore(!!json.data?.hasMore)
        setPage(targetPage)
      }
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
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mb-3" />
        <p className="text-sm">加载中...</p>
      </div>
    )
  }

  if (moments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <Inbox className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-sm">还没有碎碎念，稍后再来看看吧~</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {moments.map((moment, idx) => (
        <div key={moment.id} className="relative pl-8">
          {/* 时间线竖线 + 节点 */}
          {idx < moments.length - 1 && (
            <span className="absolute left-[9px] top-8 bottom-[-18px] w-px bg-gradient-to-b from-travel-sakura to-transparent dark:from-travel-accentStrong/40" />
          )}
          <span className="absolute left-0 top-1.5 w-5 h-5 rounded-full bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] flex items-center justify-center shadow-sm">
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </span>

          <div className="card p-5 hover:border-travel-sakura dark:hover:border-travel-accentStrong transition-colors">
            <p className="text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
              {moment.content}
            </p>
            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatRelativeTime(moment.createdAt)}
                </span>
                {moment.tags && moment.tags.length > 0 && (
                  <span className="flex gap-1.5 flex-wrap">
                    {moment.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-travel-sakura/50 dark:bg-travel-accent/15 text-travel-accent dark:text-travel-accentSoft"
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
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-5 py-2 rounded-full bg-travel-sakura/50 dark:bg-travel-accent/15 text-travel-accent dark:text-travel-accentSoft text-sm hover:bg-travel-sakura dark:hover:bg-travel-accentStrong/40 transition-colors disabled:opacity-50"
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  )
}


