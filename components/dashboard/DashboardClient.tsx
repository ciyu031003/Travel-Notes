'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  MapPin,
  Image as ImageIcon,
  Sparkles,
  Camera,
  ArrowRight,
} from 'lucide-react'
import ChinaMap from '@/components/ChinaMap'
import { formatDate } from '@/lib/utils'

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  ALONE: '独旅', COUPLE: '情侣', FAMILY: '家庭', FRIENDS: '朋友', BFF: '闺蜜/兄弟', GROUP: '结伴', OTHER: '其他',
}

export interface DashboardData {
  provinceStats: Array<{ name: string; count: number }>
  provincesVisitedCount: number
  travelCount: number
  totalPhotos: number
  momentCount: number
  totalLikes: number
  travelPosts: never[]
  travelTypeStats?: Array<{ type: string; count: number }>
}

/** 旅行记忆空间 · 核心大数（护照式，弱化"数据后台"感） */
function BigStat({
  value,
  label,
  icon: Icon,
  href,
}: {
  value: number | string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
}) {
  const inner = (
    <div className="group flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-travel-line/70 bg-travel-sakura/40 text-travel-accent dark:border-shell-line dark:bg-travel-accent/15 dark:text-travel-bloom">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-travel-inkStrong dark:text-[#F1EFEA] tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-xs text-travel-ink/70 dark:text-shell-muted">{label}</div>
    </div>
  )
  return href ? <Link href={href} className="transition group-hover:opacity-90">{inner}</Link> : inner
}

export default function DashboardClient({ data }: { data: DashboardData }) {
  const maxProvinceCount = useMemo(
    () => Math.max(1, ...data.provinceStats.map((p) => p.count)),
    [data.provinceStats]
  )

  const recent = data.travelPosts[0] as { date: string } | undefined

  return (
    <div className="bg-gradient-to-b from-travel-cream via-travel-parchment to-travel-cream dark:from-[#12161C] dark:via-[#161B22] dark:to-[#12161C]">
      <div className="container-custom py-10 md:py-14">
        <header className="mb-10 text-center md:mb-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-travel-accent dark:text-travel-bloom">
            My Travel Space
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-travel-inkStrong dark:text-[#F1EFEA] md:text-4xl">
            我的旅行记忆空间
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-travel-ink/70 dark:text-shell-muted">
            走过的省份、写下的文字、拍下的照片——这里是你旅行的全部沉淀。
          </p>
        </header>

        {/* 核心大数（护照式，弱化后台报表感） */}
        <section className="mx-auto mb-12 grid max-w-3xl grid-cols-3 gap-6 rounded-[1.6rem] border border-travel-line/60 bg-white/60 py-8 backdrop-blur-sm dark:border-shell-line dark:bg-shell-surface/70 md:py-10">
          <BigStat icon={MapPin} label="点亮省份" value={data.provincesVisitedCount} href="/travel" />
          <BigStat icon={Camera} label="旅行记录" value={data.travelCount} href="/travel" />
          <BigStat icon={ImageIcon} label="照片" value={data.totalPhotos} href="/album" />
        </section>

        {/* 足迹地图（视觉主体前置） */}
        <section className="mb-14">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-travel-inkStrong dark:text-[#F1EFEA]">
              <MapPin className="h-5 w-5 text-travel-accent" />
              我的旅行足迹
            </h2>
            <Link href="/travel" className="inline-flex items-center gap-1 text-xs text-travel-accent hover:text-travel-accentStrong">
              去旅行记录 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-travel-line/60 bg-gradient-to-br from-travel-parchment via-travel-sakura/40 to-travel-mist/30 p-2 shadow-[0_24px_50px_-24px_rgba(168,95,58,0.3)] dark:border-shell-line dark:from-[#1F272E] dark:via-[#241B15] dark:to-[#1B2128]">
            <div className="h-[340px] sm:h-[440px] lg:h-[520px]">
              <ChinaMap posts={data.travelPosts as never} />
            </div>
          </div>
        </section>

        {/* 省份打卡 + 内容构成（左右分栏，弱化为侧栏） */}
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-[1.4rem] border border-travel-line/60 bg-white/70 p-6 dark:border-shell-line dark:bg-shell-surface/80">
            <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-travel-inkStrong dark:text-[#F1EFEA]">
              <MapPin className="h-4 w-4 text-travel-accent" />
              省份打卡
            </h2>
            {data.provinceStats.length === 0 ? (
              <p className="py-10 text-center text-sm text-travel-ink/70 dark:text-shell-muted">
                还没有旅行记录，去点亮第一个省份吧
              </p>
            ) : (
              <div className="space-y-4">
                {data.provinceStats.slice(0, 8).map((p) => (
                  <div key={p.name}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-travel-ink dark:text-shell-text">{p.name}</span>
                      <span className="tabular-nums text-travel-ink/60 dark:text-shell-muted">{p.count} 篇</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-travel-sakura/40 dark:bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-travel-bloom to-travel-accent transition-all duration-700"
                        style={{ width: `${(p.count / maxProvinceCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[1.4rem] border border-travel-line/60 bg-white/70 p-6 dark:border-shell-line dark:bg-shell-surface/80">
            <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-travel-inkStrong dark:text-[#F1EFEA]">
              <Sparkles className="h-4 w-4 text-travel-accent" />
              内容构成
            </h2>
            <div className="space-y-4">
              {[
                { label: '旅行记录', value: data.travelCount, color: 'bg-travel-accent' },
                { label: '旅行照片', value: data.totalPhotos, color: 'bg-travel-bloom' },
                { label: '碎碎念', value: data.momentCount, color: 'bg-travel-sand' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.color} flex-shrink-0`} />
                  <span className="flex-1 text-sm text-travel-ink dark:text-shell-text">{item.label}</span>
                  <span className="tabular-nums text-sm text-travel-ink/60 dark:text-shell-muted">{item.value}</span>
                </div>
              ))}
            </div>
            {data.travelTypeStats && data.travelTypeStats.length > 0 && (() => {
              const stats = data.travelTypeStats as Array<{ type: string; count: number }>
              const max = Math.max(1, stats[0]?.count ?? 1)
              return (
                <div className="mt-5 border-t border-travel-line/50 pt-4 dark:border-shell-line">
                  <p className="mb-2.5 text-xs font-medium text-travel-ink/60 dark:text-shell-muted">旅行类型</p>
                  <div className="space-y-2">
                    {stats.slice(0, 5).map((s) => (
                      <div key={s.type} className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-xs text-travel-ink/70 dark:text-shell-muted">
                          {TRAVEL_TYPE_LABELS[s.type] || s.type}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-travel-sakura/40 dark:bg-white/5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-travel-bloom to-travel-accent"
                            style={{ width: `${Math.min(100, (s.count / max) * 100)}%` }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-travel-ink/60 dark:text-shell-muted">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            <div className="mt-6 border-t border-travel-line/50 pt-4 dark:border-shell-line">
              <p className="text-xs text-travel-ink/50 dark:text-shell-faint">
                最近更新：{recent ? formatDate(recent.date) : '—'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
