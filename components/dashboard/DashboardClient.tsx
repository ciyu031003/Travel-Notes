'use client'

import { useMemo } from 'react'
import dynamicImport from 'next/dynamic'
import Link from 'next/link'
import {
  MapPin,
  Image as ImageIcon,
  Sparkles,
  Camera,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { formatDate } from '@/lib/utils'

/**
 * P1-19：ChinaMap 静态引入 lib/geo → 570KB 中国 GeoJSON（193KB gz），
 * 而看板只展示「点亮省份数」。与 app/travel/TravelClient.tsx 的策略统一：
 * 动态加载 + 骨架占位，首屏不再下载整份地理数据。
 */
const ChinaMap = dynamicImport(() => import('@/components/ChinaMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] w-full animate-pulse rounded-2xl bg-travel-sakura/30 dark:bg-shell-surface2 md:h-[360px]" aria-hidden="true" />
  ),
})

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

/** 核心大数：糖果色统计块 */
function BigStat({ value, label, icon, href, tone }: {
  value: number | string
  label: string
  icon: LucideIcon
  href?: string
  tone: 'pink' | 'honey' | 'mint'
}) {
  const toneCls = tone === 'pink' ? 'm2-tone-pink' : tone === 'honey' ? 'm2-tone-honey' : 'm2-tone-mint'
  const inner = (
    <div className="flex flex-col items-center text-center">
      <span className={`m2-icon-box ${toneCls}`}>
        <Icon icon={icon} size="md" />
      </span>
      <span className="mt-2 text-[22px] font-bold leading-none tabular-nums text-[var(--m-text)]">{value}</span>
      <span className="mt-1 text-[11px] text-[var(--m-faint)]">{label}</span>
    </div>
  )
  return href ? <Link href={href} className="m-press block rounded-[14px] py-2">{inner}</Link> : inner
}

export default function DashboardClient({ data }: { data: DashboardData }) {
  const maxProvinceCount = useMemo(
    () => Math.max(1, ...data.provinceStats.map((p) => p.count)),
    [data.provinceStats]
  )

  const recent = data.travelPosts[0] as { date: string } | undefined
  const typeMax = Math.max(1, ...(data.travelTypeStats ?? []).map((t) => t.count))
  const composition = [
    { label: '旅行记录', value: data.travelCount, width: data.travelCount },
    { label: '旅行照片', value: data.totalPhotos, width: data.totalPhotos },
    { label: '碎碎念', value: data.momentCount, width: data.momentCount },
  ]
  const compositionMax = Math.max(1, ...composition.map((c) => c.width))

  return (
    <div className="m2-screen min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))] text-[var(--m-text)]">
      <div className="relative mx-auto max-w-3xl pb-6">
        <div className="m-safe-top pb-2 pt-1">
          <LargeTitle title="数据看板" subtitle="足迹与照片的全部沉淀" back="/me" />
        </div>

        <main className="space-y-5 px-[18px]">
          {/* 核心大数 */}
          <section className="m2-card p-4">
            <p className="m2-eyebrow">MY TRAVEL MEMORY</p>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.02em]">我的旅行记忆空间</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--m-muted)]">
              走过的省份、写下的文字、拍下的照片，都在这里。
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="m2-stat-tile"><BigStat icon={MapPin} label="点亮省份" value={data.provincesVisitedCount} href="/travel" tone="pink" /></div>
              <div className="m2-stat-tile"><BigStat icon={Camera} label="旅行记录" value={data.travelCount} href="/travel" tone="honey" /></div>
              <div className="m2-stat-tile"><BigStat icon={ImageIcon} label="照片" value={data.totalPhotos} href="/album" tone="mint" /></div>
            </div>
          </section>

          {/* 足迹地图 */}
          <section className="m2-card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 className="m2-section-title">我的旅行足迹</h2>
              <Link href="/travel" className="m2-section-link">
                去旅行记录 <Icon icon={ArrowRight} size="sm" />
              </Link>
            </div>
            <div className="relative mt-3 h-[260px] w-full overflow-hidden border-y border-[var(--m-line)] bg-[linear-gradient(140deg,#FFE6EE,#FFF8F3_52%,#FFF1CF)] dark:bg-[linear-gradient(140deg,#3A1D28,#241720_52%,#3D2D16)]">
              <ChinaMap posts={data.travelPosts as never} />
            </div>
            <p className="px-4 py-3 text-[11px] text-[var(--m-faint)]">足迹分布示意 · 点亮省份会在地图上高亮</p>
          </section>

          {/* 省份打卡 */}
          <section className="m2-card p-4">
            <div className="m2-section-head">
              <h2 className="m2-section-title">省份打卡</h2>
              <span className="text-[11px] text-[var(--m-faint)]">{data.provincesVisitedCount} / 34 省</span>
            </div>
            {data.provinceStats.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--m-muted)]">还没有旅行记录，去点亮第一个省份吧</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {data.provinceStats.map((p) => (
                    <span key={p.name} className="m2-pill m2-pill-pink min-h-[32px] px-3 text-[12px]">
                      {p.name} · {p.count}
                    </span>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  {data.provinceStats.slice(0, 8).map((p) => (
                    <div key={p.name}>
                      <div className="mb-1.5 flex items-center justify-between text-[11px]">
                        <span className="text-[var(--m-muted)]">{p.name}</span>
                        <span className="tabular-nums text-[var(--m-faint)]">{p.count} 篇</span>
                      </div>
                      <div className="m2-progress-soft">
                        <i style={{ width: `${(p.count / maxProvinceCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 内容构成 */}
          <section className="m2-card p-4">
            <h2 className="m2-section-title">内容构成</h2>
            <div className="mt-4 space-y-3">
              {composition.map((item, i) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--m-muted)]">{item.label}</span>
                    <span className="font-semibold tabular-nums text-[var(--m-text)]">{item.value}</span>
                  </div>
                  <div className="m2-progress-soft">
                    <i
                      style={{
                        width: `${Math.min(100, (item.width / compositionMax) * 100)}%`,
                        background: i === 0 ? 'var(--m-accent-strong)' : i === 1 ? 'var(--m-tone-sun-fg)' : 'var(--m-tone-mint-fg)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {data.travelTypeStats && data.travelTypeStats.length > 0 && (
              <div className="mt-5 border-t border-[var(--m-line)] pt-4">
                <p className="mb-3 text-[11px] font-semibold text-[var(--m-muted)]">旅行类型</p>
                <div className="space-y-2.5">
                  {data.travelTypeStats.slice(0, 5).map((s, i) => (
                    <div key={s.type} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[11px] text-[var(--m-muted)]">
                        {TRAVEL_TYPE_LABELS[s.type] || s.type}
                      </span>
                      <div className="m2-progress-soft flex-1">
                        <i
                          style={{
                            width: `${Math.min(100, (s.count / typeMax) * 100)}%`,
                            background: ['var(--m-accent-strong)', 'var(--m-tone-sun-fg)', 'var(--m-tone-lavender-fg)', 'var(--m-tone-mint-fg)', 'var(--m-tone-sky-fg)'][i % 5],
                          }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-[var(--m-faint)]">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-5 border-t border-[var(--m-line)] pt-3 text-[11px] text-[var(--m-faint)]">
              最近更新：{recent ? formatDate(recent.date) : '—'}
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
