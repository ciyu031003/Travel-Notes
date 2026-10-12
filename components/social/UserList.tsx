'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
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
    <div className="min-h-dvh bg-[var(--social-bg)] pb-28 text-[var(--social-text)]">
      {/* m-safe-top：同「我的收藏」，避免标题栏与状态栏重叠 */}
      <div className="m-safe-top relative mx-auto max-w-2xl px-4 pb-6">
        <header className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBackOrHome(router, '/me')}
            aria-label="返回上一级"
            className="m-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition-colors hover:text-[var(--social-text)]"
          >
            <Icon icon={ArrowLeft} size="md" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--social-accent)]">People</p>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
          <SocialThemeToggle />
        </header>
        {loading ? (
          <div className="py-20 text-center text-[var(--social-faint)]"><Icon icon={Loader2} size="md" className="mx-auto animate-spin" /></div>
        ) : users.length === 0 ? (
          <p className="py-20 text-center text-sm text-[var(--social-faint)]">暂无数据。</p>
        ) : (
          <div className="space-y-1">
            {users.map((u) => {
              const name = u.nickname || u.username
              return (
                <Link key={u.id} href={circleUserHref(u.id) ?? '/circle'} className="flex items-center gap-3 border-b border-[var(--social-line)] px-2 py-3.5 transition hover:bg-[var(--social-surface-50)]">
                  <SocialAvatar name={name} avatarUrl={u.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <span className="text-xs text-[var(--social-faint)]">@{u.username}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
