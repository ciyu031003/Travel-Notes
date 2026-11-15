'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Users } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { goBackOrHome } from '@/lib/navigation'
import { circleUserHref } from '@/lib/routes'

export default function UserList({ endpoint, title }: { endpoint: string; title: string }) {
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
        <header className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBackOrHome(router, '/me')}
            aria-label="返回上一级"
            className="m-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] transition-colors hover:text-[var(--ui-social-text)]"
          >
            <Icon icon={ArrowLeft} size="md" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="m2-eyebrow">PEOPLE</p>
            <h1 className="mt-0.5 text-[26px] font-bold leading-[32px] tracking-[-0.03em]">{title}</h1>
          </div>
          <SocialThemeToggle />
        </header>
        {loading ? (
          <div className="py-20 text-center text-[var(--ui-social-faint)]"><Icon icon={Loader2} size="md" className="mx-auto animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="m2-card flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
              <Icon icon={Users} size="lg" />
            </span>
            <p className="mt-4 text-[15px] font-semibold">还没有{title.replace('我的', '')}</p>
            <p className="mt-1.5 max-w-[260px] text-[12px] leading-5 text-[var(--ui-social-muted)]">
              去旅行圈逛逛，遇到喜欢的旅行者可以关注或互动。
            </p>
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
