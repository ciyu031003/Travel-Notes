'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck } from 'lucide-react'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { Button } from '@/components/mobile/Button'
import { Loader } from '@/components/mobile/Loader'
import { EmptyState } from '@/components/mobile/EmptyState'
import { hapticLight } from '@/lib/mobile/haptics'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { circlePostHref, circleUserHref } from '@/lib/routes'

/**
 * 我的通知（M5 · D6 修复）
 *
 * 此前这是**唯一不使用设计系统的二级页**：手写 header（返回圆钮 + 大写眉标 +
 * 自定标题）、手写加载态（转圈图标）、手写空态（一行灰字），既没有 iOS 大标题，
 * 也没有与 /me/settings 一致的骨架，观感割裂。
 *
 * 现在对齐 `/me/settings` 的骨架：社交底 + 氛围光 + LargeTitle + 设计系统组件。
 * 颜色仍走 `--social-*`（设计规范 §5.3 跨主题边界：只归一结构与尺寸，不切色板）。
 */
export default function NotificationsList() {
  const [data, setData] = useState<any[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/social/notifications?page=1&pageSize=50')
      if (res.ok) {
        const j = await res.json()
        setData(j.data?.data || [])
        setUnread(j.data?.unread || 0)
      }
    } catch {
      // 静默失败：保持上一次内容，不打断浏览
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const markAll = async () => {
    setBusy(true)
    try {
      await fetch('/api/social/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    } catch {
      // 失败时 load() 会拉回真实状态
    } finally {
      setBusy(false)
      await load()
    }
  }

  const typeLabel: Record<string, string> = {
    LIKE: '赞了你的旅行',
    COMMENT: '评论了你的旅行',
    REPLY: '回复了你的评论',
    FAVORITE: '收藏了你的旅行',
    FOLLOW: '关注了你',
  }

  const targetHref = (n: any) => {
    // 通知里的关联对象可能已删除（refId 为空）→ 退回旅行圈首页，不跳 /circle/undefined
    if (n.refType === 'User') return circleUserHref(n.refId) ?? '/circle'
    return n.refType === 'TravelPost' ? circlePostHref(n.refId) ?? '/circle' : '/circle'
  }

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-[calc(96px+env(safe-area-inset-bottom))] text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[320px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />

      <div className="relative mx-auto max-w-2xl px-4 pb-8 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 sm:py-8">
        <LargeTitle
          title="我的通知"
          subtitle={unread > 0 ? `${unread} 条未读` : '赞、评论、收藏与关注'}
          back="/me"
          trailing={<SocialThemeToggle />}
        />

        {unread > 0 && !loading && (
          <div className="mb-4 flex justify-end">
            <Button
              size="md"
              variant="secondary"
              icon={CheckCheck}
              loading={busy}
              onClick={markAll}
            >
              全部已读
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader variant="ring" size="lg" label="正在加载通知" />
          </div>
        ) : data.length === 0 ? (
          <div className="m-card">
            <EmptyState
              icon={Bell}
              title="暂无通知"
              description="有人赞、评论或收藏你的旅行时，会出现在这里。"
            />
          </div>
        ) : (
          <div className="m-card divide-y divide-[var(--m-line)] overflow-hidden">
            {data.map((n) => {
              const name = n.actor?.nickname || n.actor?.username || '有人'
              return (
                <Link
                  key={n.id}
                  href={targetHref(n)}
                  onClick={() => void hapticLight()}
                  className="m-pressable flex items-start gap-3 px-4 py-3.5 transition-colors active:bg-[var(--m-surface-2)]"
                >
                  <SocialAvatar name={name} avatarUrl={n.actor?.avatarUrl} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="m-body block leading-relaxed text-[var(--social-muted)]">
                      <span className="font-semibold text-[var(--social-text)]">{name}</span>{' '}
                      {typeLabel[n.type] || '与你互动'}
                    </span>
                    <span className="m-caption mt-0.5 block text-[var(--social-faint)]">
                      {new Date(n.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </span>
                  {!n.read && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--social-accent)]"
                      aria-label="未读"
                    />
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
