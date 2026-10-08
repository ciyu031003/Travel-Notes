'use client'

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import type { HomeMoment } from '@/lib/home/types'

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function MomentsStrip({ moments = [] }: { moments?: HomeMoment[] }) {
  return (
    <section className="px-3 pb-12 md:px-6 md:pb-16">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-travel-line/70 dark:border-shell-line bg-white/85 dark:bg-shell-surface/90 p-6 shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-lg font-semibold text-travel-ink dark:text-shell-text">
              <Icon icon={Sparkles} size="md" className="text-travel-accent dark:text-travel-bloom" />
              碎碎念
            </h2>
            <Link
              href="/moments"
              className="inline-flex items-center gap-1 text-xs text-travel-accent dark:text-travel-bloom transition-colors hover:text-travel-accentStrong"
            >
              全部
              <Icon icon={ArrowRight} size="sm" />
            </Link>
          </div>

          {moments.length === 0 ? (
            <div className="py-10 text-center">
              <Icon icon={Sparkles} size="lg" tone="accent" className="mx-auto" />
              <p className="mt-3 text-sm text-travel-ink dark:text-shell-muted">还没有碎碎念，来写第一条吧</p>
              {/* 空态引导去 /moments（页面内有写入口）；此前指向 /admin/moments，
                  未登录访客会被甩到后台登录页，体验断裂 */}
              <Link
                href="/moments"
                className="mt-4 inline-flex items-center gap-1 rounded-xl bg-travel-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-travel-accentStrong"
              >
                写一条碎碎念
                <Icon icon={ArrowRight} size="sm" />
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {moments.map((moment) => (
                <Link
                  key={moment.id}
                  href="/moments"
                  className="group block rounded-xl border border-travel-line/60 dark:border-shell-line bg-white dark:bg-shell-surface p-4 transition-all hover:border-travel-bloom/70 hover:shadow-md"
                >
                  <p className="text-sm leading-relaxed text-travel-ink dark:text-shell-text line-clamp-3 whitespace-pre-wrap break-words">
                    {moment.content}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-travel-ink dark:text-shell-muted">{timeAgo(moment.createdAt)}</span>
                    {moment.tags && moment.tags.length > 0 && (
                      <span className="rounded-full bg-travel-sakura/50 dark:bg-shell-surface px-1.5 py-0.5 text-[10px] text-travel-accent dark:text-travel-bloom">
                        #{moment.tags[0]}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
