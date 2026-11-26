'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Users } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { circleUserHref } from '@/lib/routes'

export default function UserList({
  endpoint,
  title,
  eyebrow,
  subtitle,
}: {
  endpoint: string
  title: string
  eyebrow?: string
  subtitle?: string
}) {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(endpoint).then((r) => r.json()).then((j) => setUsers(j.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [endpoint])

  return (
    <div className="min-h-dvh bg-[var(--ui-social-bg)] pb-28 text-[var(--ui-social-text)]">
      {/* m-safe-top：同「我的收藏」，避免标题栏与状态栏重叠 */}
      <div className="m-safe-top relative mx-auto max-w-2xl px-4 pb-6">
        {/* 统一页头（B）：与 /me 其它二级页同一套返回键 / 眉标 / 衬线标题 */}
        <LargeTitle
          title={title}
          eyebrow={eyebrow}
          subtitle={subtitle}
          back="/me"
          trailing={<SocialThemeToggle className="m-nav-icon" />}
        />
        {loading ? (
          <div className="py-20 text-center text-[var(--ui-social-faint)]"><Icon icon={Loader2} size="md" className="mx-auto animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="m2-card flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
              <Icon icon={Users} size="lg" />
            </span>
            <p className="mt-4 text-[15px] font-semibold">还没有{title.replace('我的', '')}</p>
            <button type="button" onClick={() => router.push('/circle')} className="m-btn m-btn-primary mt-5">
              去旅行圈
            </button>
          </div>
        ) : (
          <div className="m2-list-group">
            {users.map((u) => {
              const name = u.nickname || u.username
              return (
                <Link key={u.id} href={circleUserHref(u.id) ?? '/circle'} className="m2-list-row">
                  <SocialAvatar name={name} avatarUrl={u.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--ui-social-faint)]">@{u.username}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--ui-social-accent)]">查看</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
