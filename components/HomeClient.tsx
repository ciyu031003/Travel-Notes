'use client'

import { useState, useEffect, useRef, type ComponentType, type CSSProperties } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Heart,
  MapPin,
  Globe2,
  ArrowRight,
  MessageCircle,
  Quote,
  CalendarDays,
  Image as ImageIcon,
} from 'lucide-react'
import HeroFootprintMap from '@/components/home/HeroFootprintMap'
import MomentsStrip from '@/components/moments/MomentsStrip'
import { DanmakuSection, type DanmakuSectionHandle } from '@/components/home/DanmakuSection'

interface PostMeta {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  tags?: string[]
  location?: string
}

interface AnniversaryItem {
  id: number
  title: string
  date: string
  recurring: boolean
  description: string | null
}

interface HomeClientProps {
  travelPosts: PostMeta[]
  provincesVisitedCount: number
  anniversaries?: AnniversaryItem[]
}

function daysUntil(date: string, recurring: boolean): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date)
  if (!recurring) {
    const t = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    return Math.max(0, Math.round((t.getTime() - today.getTime()) / 86400000))
  }
  const next = new Date(now.getFullYear(), target.getMonth(), target.getDate())
  if (next.getTime() < today.getTime()) next.setFullYear(next.getFullYear() + 1)
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

function formatAnniversaryDate(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
}

const dailyQuotes = [
  '世界那么大，我想去看看',
  '人生不是一场赛跑，而是一次旅行',
  '生活不止眼前的苟且，还有诗和远方',
  '愿你我既能朝九晚五，也能浪迹天涯',
  '旅行的意义不在于目的地，而在于沿途的风景',
  '把时间浪费在美好的事物上',
  '愿我们都能成为自己的太阳',
  '心中有光，脚下有路',
  '愿你走出半生，归来仍是少年',
  '生活明朗，万物可爱',
  '愿所有的美好都如期而至',
  '星光不问赶路人，时光不负有心人',
  '保持热爱，奔赴山海',
  '愿你一生努力，一生被爱',
  '想要的都拥有，得不到的都释怀',
]

interface DanmakuSectionRef {
  open: () => void
}

const danmakuColors = [
  '#D98E9E',
  '#C97E55',
  '#A85F3A',
  '#E4B478',
  '#B85A6D',
  '#D4A5B0',
]

function getDailyQuote(): string {
  const today = new Date()
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  )
  return dailyQuotes[dayOfYear % dailyQuotes.length]
}

function SectionTitle({
  icon: Icon,
  children,
  action,
}: {
  icon: ComponentType<{ className?: string }>
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold text-travel-ink dark:text-shell-text">
        <Icon className="h-[18px] w-[18px] text-travel-accent dark:text-travel-bloom" />
        {children}
      </h2>
      {action}
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  action,
  href,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  desc: string
  action: string
  href?: string
  onClick?: () => void
}) {
  const [spot, setSpot] = useState({ x: 50, y: 50 })
  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setSpot({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    })
  }
  const cls =
    'group relative flex flex-col items-start gap-3 rounded-2xl border border-travel-line/70 dark:border-shell-line bg-white/85 dark:bg-shell-surface/90 p-7 text-left shadow- lg:p-8[0_10px_28px_-12px_rgba(90,102,112,0.18)] transition-all hover:-translate-y-0.5 hover:border-travel-bloom/70 hover:shadow-[0_16px_36px_-16px_rgba(168,95,58,0.28)]'
  const body = (
    <>
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(220px circle at ${spot.x}% ${spot.y}%, rgba(228,180,120,0.16), transparent 62%)`,
        }}
      />
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-travel-sakura dark:bg-shell-surface text-travel-accent dark:text-travel-bloom transition-transform group-hover:scale-105">
        <Icon className="h-7 w-7" />
      </span>
      <span>
        <span className="block text-base font-semibold text-travel-ink dark:text-shell-text">{title}</span>
        <span className="mt-1 block text-sm text-travel-ink dark:text-shell-muted">{desc}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-travel-accent dark:text-travel-bloom">
        {action}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </>
  )
  if (href) {
    return (
      <Link href={href} className={cls} onMouseMove={onMove}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls} onMouseMove={onMove}>
      {body}
    </button>
  )
}

export default function HomeClient({
  travelPosts,
  provincesVisitedCount,
  anniversaries = [],
}: HomeClientProps) {
  const danmakuRef = useRef<DanmakuSectionHandle | null>(null)
  const quote = getDailyQuote()

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-travel-cream via-travel-parchment to-travel-cream text-travel-ink dark:from-[#12161C] dark:via-[#161B22] dark:to-[#12161C] dark:text-shell-text">
      <DanmakuSection ref={danmakuRef} />

      <div className="relative z-10">
        {/* Hero 区域 - 沉浸足迹地图 */}
        <section className="px-3 pt-8 pb-6 md:px-6 md:pt-16 md:pb-10">
          <div className="mx-auto grid max-w-7xl items-center gap-8 md:grid-cols-[1.02fr_0.98fr] md:gap-12 lg:gap-16">
            <div className="animate-[fade-in-up_0.7s_ease-out_both] text-center md:text-left">
              <h1 className="font-display text-display-hero font-bold tracking-tight text-travel-inkStrong dark:text-shell-text md:text-6xl xl:text-7xl">
                <span className="block">走过的</span>
                <span className="relative mt-1 inline-block">
                  地方
                  <svg
                    className="absolute -bottom-1.5 left-0 h-3 w-full text-travel-bloom/70"
                    viewBox="0 0 200 12"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M0,8 Q50,2 100,6 T200,4"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
              <p className="mt-7 text-sm tracking-[0.2em] text-travel-accent dark:text-travel-bloom md:text-base">
                行迹 · 记录每一段旅行时光
              </p>
              <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-travel-ink dark:text-shell-muted md:mx-0 md:text-lg">
                用文字记录生活，用照片定格瞬间 —— 在这里，收藏每一段旅行记忆
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <Link
                  href="/travel"
                  className="group inline-flex items-center gap-2 rounded-xl bg-travel-accent px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-travel-accent/25 transition-all hover:bg-travel-accentStrong hover:shadow-xl md:text-base"
                >
                  <MapPin className="h-4 w-4" />
                  打开旅行地图
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/album"
                  className="group inline-flex items-center gap-2 rounded-xl border border-travel-line/70 bg-white/85 px-6 py-3.5 text-sm font-semibold text-travel-ink transition-all hover:bg-travel-sakura/30 dark:border-shell-line dark:bg-shell-surface/90 dark:text-shell-text md:text-base"
                >
                  <ImageIcon className="h-4 w-4 text-travel-accent dark:text-travel-bloom" />
                  旅行画册
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <span className="inline-flex items-center gap-2 rounded-xl border border-travel-line/70 bg-white/85 px-4 py-3 text-sm text-travel-ink dark:border-shell-line dark:bg-shell-surface/90 dark:text-shell-muted">
                  <Globe2 className="h-4 w-4 text-travel-accent dark:text-travel-bloom" />
                  <span className="font-medium text-travel-ink dark:text-shell-text">{provincesVisitedCount}</span>
                  个省份
                  <span className="mx-1 h-4 w-px bg-travel-line dark:bg-shell-line" />
                  <span className="font-medium text-travel-ink dark:text-shell-text">{travelPosts.length}</span>
                  篇旅行
                </span>
              </div>
            </div>

            <div className="relative animate-[fade-in-up_0.7s_ease-out_0.15s_both]">
              <div className="relative h-[260px] overflow-hidden rounded-2xl border border-travel-line/40 bg-gradient-to-br from-travel-parchment via-travel-sakura/40 to-travel-mist/40 shadow-[0_24px_50px_-24px_rgba(168,95,58,0.35)] dark:border-shell-line dark:from-[#1F272E] dark:via-[#241B15] dark:to-[#1B2128] md:h-[400px] lg:h-[430px]">
                <HeroFootprintMap posts={travelPosts} />
              </div>
              <span className="absolute bottom-3 right-3 rounded-full border-2 border-dashed border-travel-accentSoft bg-[#FBF3E9] px-3 py-1.5 text-xs font-medium text-travel-accent shadow-sm dark:border-travel-bloom/70 dark:bg-shell-surface dark:text-travel-bloom">
                足迹地图 · {provincesVisitedCount} 省
              </span>
            </div>
          </div>
        </section>

        {/* 最近旅行 */}
        <section className="px-3 pb-12 md:px-6 md:pb-16">
          <div className="mx-auto max-w-7xl">
            <div className="rounded-2xl border border-travel-line/70 dark:border-shell-line bg-white/85 dark:bg-shell-surface/90 p-6 shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:p-8">
              <SectionTitle
                icon={MapPin}
                action={
                  <Link
                    href="/travel"
                    className="inline-flex items-center gap-1 text-xs text-travel-accent dark:text-travel-bloom transition-colors hover:text-travel-accentStrong"
                  >
                    查看全部
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                最近旅行
              </SectionTitle>
              <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 scrollbar-hide">
                {travelPosts.slice(0, 6).map((post) => (
                  <Link
                    key={post.slug}
                    href={`/travel/${post.slug}`}
                    className="group w-72 flex-shrink-0 snap-start lg:w-80 overflow-hidden rounded-xl border border-travel-line/60 dark:border-shell-line bg-white dark:bg-shell-surface transition-all hover:border-travel-bloom/70 hover:shadow-md"
                  >
                    {post.cover ? (
                      <div className="relative h-40 overflow-hidden bg-travel-sakura/40 dark:bg-shell-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <Image
                          src={post.cover}
                          alt={post.title}
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="flex h-40 items-center justify-center bg-gradient-to-br from-[#FBF0E6] to-travel-sakura/70 dark:from-[#241C15] dark:to-[#292119]">
                        <MapPin className="h-7 w-7 text-travel-accentSoft" />
                      </div>
                    )}
                    <div className="p-4">
                      <p className="line-clamp-1 font-medium text-travel-ink dark:text-shell-text transition-colors group-hover:text-travel-accent">
                        {post.title}
                      </p>
                      <p className="mt-1 text-xs text-travel-ink dark:text-shell-muted">
                        {new Date(post.date).toLocaleDateString('zh-CN')}
                        {post.location && ` · ${post.location}`}
                      </p>
                    </div>
                  </Link>
                ))}
                {travelPosts.length === 0 && (
                  <div className="flex w-full flex-col items-center justify-center py-10 text-center">
                    <p className="text-sm text-travel-ink dark:text-shell-muted">还没有旅行记录</p>
                    <Link
                      href="/travel"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-travel-accent dark:text-travel-bloom hover:text-travel-accentStrong"
                    >
                      去旅行地图看看
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 碎碎念 */}
        <MomentsStrip />

        {/* 纪念日 */}
        {anniversaries.length > 0 && (
          <section className="px-3 pb-12 md:px-6 md:pb-16">
            <div className="mx-auto max-w-7xl">
              <div className="rounded-2xl border border-travel-line/70 dark:border-shell-line bg-white/85 dark:bg-shell-surface/90 p-6 shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:p-8">
                <SectionTitle icon={CalendarDays}>重要日子</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {anniversaries.map((a) => {
                    const days = daysUntil(a.date, a.recurring)
                    return (
                      <div
                        key={a.id}
                        className="rounded-xl border border-travel-sakura/70 dark:border-shell-line bg-travel-parchment dark:bg-shell-surface p-4"
                      >
                        <p className="text-xs text-travel-accent dark:text-travel-bloom">
                          {a.recurring ? '周年纪念' : '纪念日'} · {formatAnniversaryDate(a.date)}
                        </p>
                        <p className="mt-1.5 font-semibold text-travel-ink dark:text-shell-text">{a.title}</p>
                        <div className="mt-2 flex items-end gap-2">
                          <span className="font-display text-4xl font-bold leading-none text-travel-accent dark:text-travel-bloom">
                            {days}
                          </span>
                          <span className="pb-1 text-sm text-travel-ink dark:text-shell-muted">天</span>
                        </div>
                        <p className="mt-1 text-xs text-travel-ink dark:text-shell-muted">
                          {days === 0 ? '就是今天' : '距离这个日子还有'}
                        </p>
                        {a.description && (
                          <p className="mt-1 text-xs text-travel-ink dark:text-shell-muted">{a.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 每日一言 */}
        <section className="px-3 pb-12 md:px-6 md:pb-16">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-travel-bloom/40 dark:border-shell-line bg-white/90 dark:bg-shell-surface/95 px-6 py-10 text-center shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:py-12">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-travel-accent dark:text-travel-bloom">
                <Quote className="h-4 w-4" />
                <span>每日一言</span>
                <Quote className="h-4 w-4" />
              </div>
              <p className="mt-4 text-lg font-medium leading-relaxed text-travel-ink dark:text-shell-text md:text-2xl">
                「{quote}」
              </p>
              <div className="mx-auto mt-5 flex h-20 w-20 rotate-[-6deg] items-center justify-center rounded-full border-2 border-dashed border-travel-accentSoft dark:border-travel-bloom/70">
                <div className="text-center text-travel-accent dark:text-travel-bloom">
                  <p className="text-[9px] tracking-[0.25em]">DAILY</p>
                  <p className="font-display text-base font-bold">
                    {new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 功能入口 */}
        <section className="px-3 pb-16 md:px-6 md:pb-20">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-4 sm:grid-cols-3">
              <FeatureCard
                icon={ImageIcon}
                title="旅行画册"
                desc="每一段旅行，都是一本杂志"
                action="翻阅画册"
                href="/album"
              />
              <FeatureCard
                icon={MessageCircle}
                title="留言板"
                desc="写下此刻想说的话"
                action="写留言"
                onClick={() => danmakuRef.current?.open()}
              />
              <FeatureCard
                icon={CalendarDays}
                title="时间线"
                desc="按年份回顾每一段旅程"
                action="去看时间线"
                href="/timeline"
              />
            </div>
          </div>
        </section>

        {/* 底部 */}
        <footer className="border-t border-travel-line/60 dark:border-shell-line px-3 py-10 md:px-5">
          <div className="mx-auto max-w-7xl text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm text-travel-ink dark:text-shell-muted">
              Made with <Heart className="h-4 w-4 fill-travel-accentSoft text-travel-accentSoft" /> by 行迹
            </p>
            <p className="mt-2 text-xs text-travel-ink dark:text-shell-muted">
              © {new Date().getFullYear()} All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
