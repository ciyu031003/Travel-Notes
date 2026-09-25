'use client'

import { Icon } from '@/components/mobile/Icon'
import { SpaceAvatar } from './SpaceAvatarStack'
import {
  activityPredicateOf,
  activityResourceIconOf,
} from '@/lib/mobile/space-system'

export interface SpaceActivityItem {
  id: number
  username: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: string | null
  createdAt: string
}

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/**
 * 空间动态（活动流）。
 *
 * 数据来源是既有 `AuditLog`（有 `spaceId` + `[spaceId, createdAt]` 索引），
 * **零改库**就拿到了「一起经营」的可见痕迹 —— 这是本方案里性价比最高的一环。
 * 空间操作（创建/邀请/改权限/改设置）本来就在写审计日志；内容类操作逐步补写。
 */
export function SpaceActivityFeed({ items }: { items: SpaceActivityItem[] }) {
  return (
    <ol className="space-y-0.5">
      {items.map((it) => {
        const { verb, subject, isQuoted } = activityPredicateOf(it.action, it.resourceType, it.metadata)
        return (
          <li key={it.id} className="flex items-start gap-2.5 py-2">
            <SpaceAvatar
              member={{ username: it.username, nickname: null, avatarUrl: null, role: 'MEMBER' }}
              size="sm"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-5 text-[var(--social-text)]">
                <span className="font-medium">{it.username}</span>
                <span className="text-[var(--social-muted)]"> {verb}</span>
                {subject &&
                  (isQuoted ? (
                    <>
                      <span className="text-[var(--social-muted)]">「</span>
                      <span className="font-medium">{subject}</span>
                      <span className="text-[var(--social-muted)]">」</span>
                    </>
                  ) : (
                    <span className="text-[var(--social-muted)]">{subject}</span>
                  ))}
                {isQuoted && it.action === 'UPDATE_PERMISSIONS' && (
                  <span className="text-[var(--social-muted)]">的权限</span>
                )}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--social-faint)]">
                <Icon icon={activityResourceIconOf(it.resourceType)} size="sm" />
                {relativeTime(it.createdAt)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default SpaceActivityFeed
