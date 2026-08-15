'use client'

import { useState, useEffect, type ComponentType, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  Heart,
  MapPin,
  Globe2,
  ArrowRight,
  MessageCircle,
  X,
  Send,
  Quote,
  CalendarDays,
  Image as ImageIcon,
  Pause,
  Play,
} from 'lucide-react'
import AlbumUnlockModal from './AlbumUnlockModal'
import HeroFootprintMap from '@/components/home/HeroFootprintMap'
import MomentsStrip from '@/components/moments/MomentsStrip'

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

interface Danmaku {
  id: string
  text: string
  color: string
  timestamp: number
}

const danmakuColors = [
  '#D98E9E',
  '#C76E80',
  '#A64E61',
  '#E8B8C2',
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
      <h2 className="flex items-center gap-2.5 text-base font-semibold text-[#3D4852] dark:text-[#E8E6E1]">
        <Icon className="h-[18px] w-[18px] text-[#A64E61] dark:text-[#E8B8C2]" />
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
  const cls =
    'group relative flex flex-col items-start gap-3 rounded-2xl border border-[#E8DDD8]/70 dark:border-[#2C343E] bg-white/85 dark:bg-[#1B2128]/90 p-6 text-left shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] transition-all hover:-translate-y-0.5 hover:border-[#E8B8C2]/70 hover:shadow-[0_16px_36px_-16px_rgba(166,78,97,0.28)]'
  const body = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F5DCE0] dark:bg-[#33262E] text-[#A64E61] dark:text-[#E8B8C2] transition-transform group-hover:scale-105">
        <Icon className="h-6 w-6" />
      </span>
      <span>
        <span className="block text-base font-semibold text-[#3D4852] dark:text-[#E8E6E1]">{title}</span>
        <span className="mt-1 block text-sm text-[#5A6670] dark:text-[#9BA3AE]">{desc}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-[#A64E61] dark:text-[#E8B8C2]">
        {action}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </>
  )
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

export default function HomeClient({
  travelPosts,
  provincesVisitedCount,
  anniversaries = [],
}: HomeClientProps) {
  const [showAlbumUnlock, setShowAlbumUnlock] = useState(false)
  const [showDanmakuInput, setShowDanmakuInput] = useState(false)
  const [danmakuText, setDanmakuText] = useState('')
  const [danmakus, setDanmakus] = useState<Danmaku[]>([])
  const [username, setUsername] = useState<string | null>(null)
  const [danmakuPaused, setDanmakuPaused] = useState(false)
  const quote = getDailyQuote()

  const closeDanmaku = () => {
    setShowDanmakuInput(false)
    setDanmakuText('')
  }

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/check-auth')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          setUsername(data.username)
        }
      }
    } catch {}
  }

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    const fetchDanmakus = async () => {
      try {
        const res = await fetch('/api/danmaku')
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.danmakus) {
            setDanmakus(data.data.danmakus)
          }
        }
      } catch {}
    }
    fetchDanmakus()
  }, [])

  useEffect(() => {
    if (!showDanmakuInput) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDanmaku()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDanmakuInput])

  const addDanmaku = async () => {
    if (!danmakuText.trim()) return

    const color = danmakuColors[Math.floor(Math.random() * danmakuColors.length)]
    try {
      const res = await fetch('/api/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: danmakuText.trim(), color }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.danmaku) {
          setDanmakus((prev) => [data.data.danmaku, ...prev])
        }
      }
    } catch {}

    closeDanmaku()
  }

  const removeDanmaku = async (id: string) => {
    try {
      const res = await fetch(`/api/danmaku?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDanmakus((prev) => prev.filter((d) => d.id !== id))
      }
    } catch {}
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#FAFBF7] via-[#FDF8F5] to-[#FAFBF7] text-[#3D4852] dark:from-[#12161C] dark:via-[#161B22] dark:to-[#12161C] dark:text-[#E8E6E1]">
      {/* 弹幕层 */}
      {!danmakuPaused && (
        <div
          aria-hidden="true"
          className="danmaku-layer fixed inset-0 z-30 pointer-events-none overflow-hidden"
        >
          {danmakus.map((d, index) => (
            <DanmakuItem
              key={d.id}
              danmaku={d}
              topOffset={5 + (index % 8) * 11}
              duration={15 + (index % 5) * 3}
              delay={(index % 10) * 2.5}
            />
          ))}
        </div>
      )}

      {/* 弹幕暂停/开启开关 */}
      {danmakus.length > 0 && (
        <button
          type="button"
          onClick={() => setDanmakuPaused((v) => !v)}
          aria-pressed={danmakuPaused}
          className="fixed bottom-[76px] right-4 z-40 flex items-center gap-1.5 rounded-full border border-[#E8DDD8]/70 dark:border-[#2C343E] bg-white/95 dark:bg-[#1B2128]/95 px-3.5 py-2 text-xs font-medium text-[#5A6670] dark:text-[#9BA3AE] shadow-lg transition-colors hover:border-[#E8B8C2]/70 hover:text-[#A64E61] md:bottom-6 md:right-6"
        >
          {danmakuPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          <span>{danmakuPaused ? '开启弹幕' : '暂停弹幕'}</span>
        </button>
      )}

      <div className="relative z-10">
        {/* Hero 区域 - 沉浸足迹地图 */}
        <section className="px-3 pb-10 md:px-5 md:pb-14">
          <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-[1.02fr_0.98fr] md:gap-10">
            <div className="animate-[fade-in-up_0.7s_ease-out_both] text-center md:text-left">
              <h1 className="font-display text-[44px] leading-[1.15] font-bold tracking-tight text-[#2D3842] dark:text-[#F1EFEA] md:text-6xl">
                <span className="block">一起走过的</span>
                <span className="relative mt-1 inline-block">
                  地方
                  <svg
                    className="absolute -bottom-1.5 left-0 h-3 w-full text-[#E8B8C2]/70"
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
              <p className="mt-6 text-sm tracking-wide text-[#A64E61] dark:text-[#E8B8C2]">
                Travel Journal · 记录我们的美好时光
              </p>
              <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-[#5A6670] dark:text-[#9BA3AE] md:mx-0">
                用文字记录生活，用照片定格瞬间 —— 在这个小小的世界里，收藏我们的每一份感动
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <Link
                  href="/travel"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[#A64E61] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#A64E61]/25 transition-all hover:bg-[#8B3A4C] hover:shadow-xl"
                >
                  <MapPin className="h-4 w-4" />
                  打开我们的地图
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <span className="inline-flex items-center gap-2 rounded-xl border border-[#E8DDD8]/70 bg-white/85 px-4 py-3 text-sm text-[#5A6670] dark:border-[#2C343E] dark:bg-[#1B2128]/90 dark:text-[#9BA3AE]">
                  <Globe2 className="h-4 w-4 text-[#A64E61] dark:text-[#E8B8C2]" />
                  <span className="font-medium text-[#3D4852] dark:text-[#E8E6E1]">{provincesVisitedCount}</span>
                  个省份
                  <span className="mx-1 h-4 w-px bg-[#E8DDD8] dark:bg-[#2C343E]" />
                  <span className="font-medium text-[#3D4852] dark:text-[#E8E6E1]">{travelPosts.length}</span>
                  篇旅行
                </span>
              </div>
            </div>

            <div className="relative animate-[fade-in-up_0.7s_ease-out_0.15s_both]">
              <div className="overflow-hidden rounded-2xl border border-[#E8DDD8]/60 bg-white/80 shadow-[0_18px_40px_-20px_rgba(166,78,97,0.35)] dark:border-[#2C343E] dark:bg-[#1B2128]/90">
                <HeroFootprintMap posts={travelPosts} />
              </div>
              <span className="absolute -top-3 right-2 rotate-6 rounded-full border-2 border-dashed border-[#C76E80] bg-[#FFF8F4] px-3 py-1.5 text-xs font-medium text-[#A64E61] shadow-sm dark:border-[#E8B8C2]/70 dark:bg-[#2A1D22] dark:text-[#E8B8C2]">
                足迹地图 · {provincesVisitedCount} 省
              </span>
            </div>
          </div>
        </section>

        {/* 最近旅行 */}
        <section className="px-3 pb-8 md:px-5">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-2xl border border-[#E8DDD8]/70 dark:border-[#2C343E] bg-white/85 dark:bg-[#1B2128]/90 p-6 shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:p-8">
              <SectionTitle
                icon={MapPin}
                action={
                  <Link
                    href="/travel"
                    className="inline-flex items-center gap-1 text-xs text-[#A64E61] dark:text-[#E8B8C2] transition-colors hover:text-[#8B3A4C]"
                  >
                    查看全部
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                最近旅行
              </SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                {travelPosts.slice(0, 4).map((post) => (
                  <Link
                    key={post.slug}
                    href={`/travel/${post.slug}`}
                    className="group block overflow-hidden rounded-xl border border-[#E8DDD8]/60 dark:border-[#2C343E] bg-white dark:bg-[#1B2128] transition-all hover:border-[#E8B8C2]/70 hover:shadow-md"
                  >
                    {post.cover ? (
                      <div className="relative h-36 overflow-hidden bg-[#F5DCE0]/40 dark:bg-[#33262E] md:h-40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post.cover}
                          alt={post.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="flex h-24 items-center justify-center bg-gradient-to-br from-[#FDF3F5] to-[#F5DCE0]/70 dark:from-[#2A2328] dark:to-[#33262E] md:h-28">
                        <MapPin className="h-7 w-7 text-[#C76E80]" />
                      </div>
                    )}
                    <div className="p-4">
                      <p className="line-clamp-1 font-medium text-[#3D4852] dark:text-[#E8E6E1] transition-colors group-hover:text-[#A64E61]">
                        {post.title}
                      </p>
                      <p className="mt-1 text-xs text-[#5A6670] dark:text-[#9BA3AE]">
                        {new Date(post.date).toLocaleDateString('zh-CN')}
                        {post.location && ` · ${post.location}`}
                      </p>
                    </div>
                  </Link>
                ))}
                {travelPosts.length === 0 && (
                  <div className="py-10 text-center sm:col-span-2">
                    <p className="text-sm text-[#5A6670] dark:text-[#9BA3AE]">还没有旅行记录</p>
                    <Link
                      href="/travel"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#A64E61] dark:text-[#E8B8C2] hover:text-[#8B3A4C]"
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
          <section className="px-3 pb-8 md:px-5">
            <div className="mx-auto max-w-6xl">
              <div className="rounded-2xl border border-[#E8DDD8]/70 dark:border-[#2C343E] bg-white/85 dark:bg-[#1B2128]/90 p-6 shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:p-8">
                <SectionTitle icon={Heart}>我们的纪念日</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {anniversaries.map((a) => {
                    const days = daysUntil(a.date, a.recurring)
                    return (
                      <div
                        key={a.id}
                        className="rounded-xl border border-[#F5DCE0]/70 dark:border-[#3A2B31] bg-[#FDF8F5] dark:bg-[#1B2128] p-4"
                      >
                        <p className="text-xs text-[#A64E61] dark:text-[#E8B8C2]">
                          {a.recurring ? '周年纪念' : '纪念日'} · {formatAnniversaryDate(a.date)}
                        </p>
                        <p className="mt-1.5 font-semibold text-[#3D4852] dark:text-[#E8E6E1]">{a.title}</p>
                        <p className="mt-1 text-2xl font-bold text-[#A64E61] dark:text-[#E8B8C2]">
                          {days === 0 ? '就是今天' : `还有 ${days} 天`}
                        </p>
                        {a.description && (
                          <p className="mt-1 text-xs text-[#5A6670] dark:text-[#9BA3AE]">{a.description}</p>
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
        <section className="px-3 pb-8 md:px-5">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-[#E8B8C2]/40 dark:border-[#5A3A44] bg-white/90 dark:bg-[#1B2128]/95 px-6 py-8 text-center shadow-[0_10px_28px_-12px_rgba(90,102,112,0.18)] md:py-10">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-[#A64E61] dark:text-[#E8B8C2]">
                <Quote className="h-4 w-4" />
                <span>每日一言</span>
                <Quote className="h-4 w-4" />
              </div>
              <p className="mt-4 text-lg font-medium leading-relaxed text-[#3D4852] dark:text-[#E8E6E1] md:text-xl">
                「{quote}」
              </p>
              <p className="mt-4 text-xs text-[#5A6670] dark:text-[#9BA3AE]">
                {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </section>

        {/* 功能入口 */}
        <section className="px-3 pb-12 md:px-5">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-4 sm:grid-cols-3">
              <FeatureCard
                icon={ImageIcon}
                title="我们的相册"
                desc="恋爱纪念日解锁，收藏我们的照片"
                action="查看相册"
                onClick={() => setShowAlbumUnlock(true)}
              />
              <FeatureCard
                icon={MessageCircle}
                title="留言板"
                desc="写下想对对方说的话"
                action="写留言"
                onClick={() => setShowDanmakuInput(true)}
              />
              <FeatureCard
                icon={CalendarDays}
                title="时间线"
                desc="把我们的故事串成一条线"
                action="去看时间线"
                href="/timeline"
              />
            </div>
          </div>
        </section>

        {/* 底部 */}
        <footer className="border-t border-[#E8DDD8]/60 dark:border-[#2C343E] px-3 py-10 md:px-5">
          <div className="mx-auto max-w-6xl text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm text-[#5A6670] dark:text-[#9BA3AE]">
              Made with <Heart className="h-4 w-4 fill-[#C76E80] text-[#C76E80]" /> by 袁同学 & 阿比旦
            </p>
            <p className="mt-2 text-xs text-[#5A6670] dark:text-[#9BA3AE]">
              © {new Date().getFullYear()} All rights reserved.
            </p>
          </div>
        </footer>
      </div>

      {/* 相册解锁弹窗 */}
      <AlbumUnlockModal isOpen={showAlbumUnlock} onClose={() => setShowAlbumUnlock(false)} />

      {/* 留言弹窗 */}
      {showDanmakuInput && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="写一句留言"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D4852]/40 dark:bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDanmaku()
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#E8DDD8]/70 dark:border-[#2C343E] bg-white dark:bg-[#1B2128] shadow-2xl">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-[#3D4852] dark:text-[#E8E6E1]">
                  <MessageCircle className="h-5 w-5 text-[#C76E80]" />
                  写一句留言
                </h3>
                <button
                  onClick={closeDanmaku}
                  aria-label="关闭"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#5A6670] dark:text-[#9BA3AE] transition-colors hover:bg-[#F5DCE0]/60 hover:text-[#3D4852]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-4 text-sm text-[#5A6670] dark:text-[#9BA3AE]">
                写下你想对对方说的话，它会在首页飘动显示
              </p>

              <textarea
                autoFocus
                value={danmakuText}
                onChange={(e) => setDanmakuText(e.target.value)}
                placeholder="在这里输入你的留言..."
                maxLength={50}
                className="h-24 w-full resize-none rounded-xl border border-[#E8DDD8] dark:border-[#2C343E] bg-[#FAFBF7] dark:bg-[#161B22] p-3 text-[#3D4852] dark:text-[#E8E6E1] transition-all placeholder-[#9A958F] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C76E80]/50"
              />
              <div className="mt-1 text-right text-xs text-[#5A6670] dark:text-[#9BA3AE]">{danmakuText.length}/50</div>

              <button
                onClick={addDanmaku}
                disabled={!danmakuText.trim()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#A64E61] py-3 font-semibold text-white transition-colors hover:bg-[#8B3A4C] disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                <span>发送留言</span>
              </button>

              {danmakus.length > 0 && (
                <div className="mt-4 border-t border-[#E8DDD8]/60 dark:border-[#2C343E] pt-4">
                  <p className="mb-2 text-xs text-[#5A6670] dark:text-[#9BA3AE]">历史留言 ({danmakus.length})</p>
                  <div className="max-h-20 space-y-1.5 overflow-y-auto">
                    {danmakus.slice(0, 3).map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-lg bg-[#FAFBF7] dark:bg-[#161B22] px-3 py-1.5 text-xs"
                      >
                        <span className="truncate text-[#3D4852] dark:text-[#E8E6E1]">{d.text}</span>
                        {username && (
                          <button
                            onClick={() => removeDanmaku(d.id)}
                            aria-label="删除这条留言"
                            className="ml-2 text-[#9A958F] transition-colors hover:text-[#C44A5A]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DanmakuItem({
  danmaku,
  topOffset,
  duration,
  delay = 0,
}: {
  danmaku: Danmaku
  topOffset: number
  duration: number
  delay?: number
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), (delay + duration) * 1000)
    return () => clearTimeout(timer)
  }, [delay, duration])

  if (!visible) return null

  const style: CSSProperties = {
    top: `${topOffset}%`,
    left: '-100px',
    animation: `floatRight ${duration}s linear ${delay}s forwards`,
    zIndex: 30,
  }

  return (
    <div className="absolute text-sm font-medium whitespace-nowrap" style={style}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8DDD8]/70 dark:border-[#2C343E] bg-white/90 dark:bg-[#1B2128]/95 px-3 py-1 text-[#5A6670] dark:text-[#9BA3AE] shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: danmaku.color }} />
        {danmaku.text}
      </span>
    </div>
  )
}
