'use client'

import Link from 'next/link'
import dynamicImport from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type Ref } from 'react'
import { apiUrl } from '@/lib/api-base'
import { normalizeCoverUrl } from '@/components/china-map/cover-url'
import { travelDetailHref } from '@/lib/routes'
import { albumDeepLink } from '@/lib/album-deep-link'
import { totalPhotoCount } from '@/lib/home/photo-count'
import { toast } from '@/lib/mobile/toast-store'
import IcpLicense from '@/components/IcpLicense'
import { Spotlight } from '@/components/ui/spotlight'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import {
  IconAlbum,
  IconArrowRight,
  IconArrowUpRight,
  IconCalendar,
  IconCircle,
  IconCompass,
  IconHeart,
  IconMapPin,
  IconPen,
  IconQuote,
  IconSpark,
  IconTicket,
  Reveal,
  TiltCard,
  useIdleMount,
} from './ink-ui'
import type { DanmakuSectionHandle } from '@/components/home/DanmakuSection'
import type { InkAnniversary, InkHomeProps } from './types'
import './ink-home.css'

/**
 * Web 桌面首页（Ink & Ivory）—— 与移动端 HomeMobile 完全独立的一套桌面设计语言。
 *
 * 版式：1440 最大宽 + 12 列不对称网格（7/5、5/7），1px 低对比分隔线，
 *       卡片 20–24 圆角、玻璃面板（blur 20px）、滚动一次性渐入、hover 抬升 + 3D 倾斜 + 微光扫过。
 * 数据：全部来自 HomeData（travelPosts / books / recentMoments / draftTravels / anniversaries），
 *       不新增接口；「票据」用最近旅程的票根呈现，入口指向 /tickets。
 * 性能（本轮实测 before/after 见交付报告）：
 *  ① Hero 不再依赖大图背景（首屏 LCP 从「背景大图」变成文字），改由渐变光晕 + SVG Spotlight 承担氛围；
 *  ② 足迹地图（HeroFootprintMap，含地图 JSON）延后到首帧后的空闲帧才挂载；
 *  ③ 弹幕留言（DanmakuSection + Modal）按需加载：空闲帧或点「写一句留言」时才拉 chunk；
 *  ④ 所有首屏之下的媒体图保留 next/image 懒加载与正确的 sizes，非首屏区块只做 IO 渐入；
 *  ⑤ 本组件不再 import lucide-react / motion，图标走内联 SVG。
 */

const HeroFootprintMap = dynamicImport(() => import('@/components/home/HeroFootprintMap'), {
  ssr: false,
  loading: () => <div className="wh-map-wait" aria-hidden="true" />,
})

/**
 * 弹幕留言按需加载（W4 性能）：**不用 next/dynamic** —— 它在 SSR 里会给未渲染的
 * dynamic 组件发一条 link rel=preload，chunk 其实还是首屏下载。
 * 这里改成「空闲帧或首次点『写一句留言』时才 import()」，HTML 里彻底没有这个 chunk。
 */
type DanmakuComponent = ComponentType<{ ref?: Ref<DanmakuSectionHandle> }>

const DAILY_QUOTES = [
  '世界那么大，我想去看看',
  '把时间浪费在美好的事物上',
  '愿你我既能朝九晚五，也能浪迹天涯',
  '旅行的意义不在于目的地，而在于沿途的风景',
  '心中有光，脚下有路',
  '保持热爱，奔赴山海',
  '星光不问赶路人，时光不负有心人',
  '愿所有的美好都如期而至',
]

function getDailyQuote(): string {
  const today = new Date()
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24),
  )
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length]
}

function formatDate(date: string): string {
  if (!date) return '待定'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function monthDay(date: string): { d: string; m: string } {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return { d: '--', m: '--' }
  return {
    d: String(parsed.getDate()).padStart(2, '0'),
    m: parsed.toLocaleDateString('zh-CN', { month: 'short' }),
  }
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const day = 86400000
  if (diff < 3600000) return '刚刚'
  if (diff < day) return Math.max(1, Math.floor(diff / 3600000)) + ' 小时前'
  if (diff < 30 * day) return Math.floor(diff / day) + ' 天前'
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
}

/**
 * 首页封面（最近旅程主图 / 画册叠放封面）—— 归一化 + 纯 img + 失败兜底。
 *
 * 为什么不用 next/image：封面在数据层（lib/home/home-data.ts）是**原样透传**的，
 * 同一条记录可能是「对象存储绝对 URL / 站内相对路径 / 未处理的裸存储键」三态之一。
 * next/image 一旦拿到 images.remotePatterns 白名单外的域名会**直接抛错**，把它放进
 * 首页就等于给整页装上错误边界（开发环境白屏，生产环境 /next/image 400 变破图）；
 * 裸存储键则必然 404。这里沿用 Web 画册（components/web/album）的既定策略：
 *   normalizeCoverUrl 归一化脏值 → 纯 img（懒加载 + 异步解码）→ onError 回退占位，
 * 任何一步失败都只影响这一张图，页面其余部分照常渲染。
 * 颜色/渐变/尺寸全部在 ink-home.css（.wh-cover-img / 容器自身的 --wh-grad-media）。
 */
function CoverArt({
  src,
  alt,
  fallback = null,
}: {
  src?: string | null
  alt: string
  fallback?: ReactNode
}) {
  const url = normalizeCoverUrl(src)
  // 记录「失败的那个地址」而不是布尔值：数据刷新换了封面时自动复活，不需要 effect 复位
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!url || failedSrc === url) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 白名单外域名/裸存储键会让 next/image 抛错并打白整个首页
    <img
      src={url}
      alt={alt}
      className="wh-cover-img"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedSrc(url)}
    />
  )
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

export default function InkHome({
  travelPosts,
  provincesVisitedCount,
  anniversaries = [],
  draftTravels = [],
  books = [],
  recentMoments = [],
  onRefresh,
}: InkHomeProps) {
  const quote = useMemo(() => getDailyQuote(), [])
  const totalPhotos = totalPhotoCount(travelPosts)
  const featured = travelPosts[0] ?? null
  const restJourneys = travelPosts.slice(1, 4)
  const ticketStubs = travelPosts.slice(0, 3)
  const visibleBooks = books.slice(0, 3)
  const moments = recentMoments.slice(0, 3)

  const [archivingId, setArchivingId] = useState<number | null>(null)
  /** 装饰光斑（Spotlight 的 SVG 高斯模糊层）也在空闲帧才挂：它只影响氛围，不该进首帧绘制 */
  const decoMounted = useIdleMount(1400)
  const mapMounted = useIdleMount(2400)
  const idleMounted = useIdleMount(2400)
  const [DanmakuHost, setDanmakuHost] = useState<DanmakuComponent | null>(null)
  const danmakuRef = useRef<DanmakuSectionHandle | null>(null)
  const pendingOpen = useRef(false)

  const loadDanmaku = useCallback(() => {
    if (DanmakuHost) return
    void import('./DanmakuHost')
      .then((mod) => setDanmakuHost(() => mod.default as DanmakuComponent))
      .catch(() => {})
  }, [DanmakuHost])

  // 空闲帧才把弹幕浮层拉进来（装饰性内容，不参与首屏）
  useEffect(() => {
    if (idleMounted) loadDanmaku()
  }, [idleMounted, loadDanmaku])

  useEffect(() => {
    if (!DanmakuHost || !pendingOpen.current) return
    pendingOpen.current = false
    requestAnimationFrame(() => danmakuRef.current?.open())
  }, [DanmakuHost])

  const openDanmaku = () => {
    if (danmakuRef.current) {
      danmakuRef.current.open()
      return
    }
    pendingOpen.current = true
    loadDanmaku()
  }

  /** 与 HomeMobile 同口径：归档后进入画册与最近旅行（走同一个 /api/travels/:id/confirm） */
  const confirmDraft = async (id: number) => {
    setArchivingId(id)
    try {
      const res = await fetch(apiUrl('/api/travels/' + id + '/confirm'), { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('confirm failed')
      toast.success('已归档，已加入旅行画册与最近旅行')
      onRefresh?.()
    } catch {
      toast.error('归档失败，请重试')
    } finally {
      setArchivingId(null)
    }
  }

  const year = new Date().getFullYear()

  return (
    <div className="wh-root">
      <div className="wh-ambient" aria-hidden="true" />

      <div className="wh-shell">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="wh-hero" aria-labelledby="wh-hero-title">
          <div className="wh-hero-glow" aria-hidden="true">
            {decoMounted ? <Spotlight className="wh-spotlight" fill="currentColor" /> : null}
          </div>

          <div className="wh-hero-copy">
            <p className="wh-eyebrow">Ink &amp; Ivory · 旅行手稿</p>
            <h1 id="wh-hero-title">
              把走过的路
              <br />
              <em>写成一册手稿</em>
            </h1>
            <p className="wh-lede">
              每个省份一枚邮戳，每段旅程一页手稿。把沿途的光线、风声与心情，收进一本可以随时重新翻开的旅行书。
            </p>
            <div className="wh-cta-row">
              <Link href="/travel" className="wh-btn wh-btn-primary">
                <IconCompass />
                打开旅行地图
              </Link>
              <Link href="/album" className="wh-btn wh-btn-ghost">
                <IconAlbum />
                翻开旅行画册
              </Link>
            </div>

            <div className="wh-stats">
              <div className="wh-stat">
                <b>
                  {provincesVisitedCount}
                  <i>省</i>
                </b>
                <span>点亮足迹</span>
              </div>
              <div className="wh-stat">
                <b>
                  {travelPosts.length}
                  <i>段</i>
                </b>
                <span>旅程记录</span>
              </div>
              <div className="wh-stat">
                <b>
                  {totalPhotos}
                  <i>张</i>
                </b>
                <span>照片珍藏</span>
              </div>
              <div className="wh-stat">
                <b>
                  {books.length}
                  <i>册</i>
                </b>
                <span>旅行画册</span>
              </div>
            </div>
          </div>

          <TiltCard className="wh-art" max={4}>
            <div className="wh-art-head">
              <span className="wh-art-label">Footprint · 足迹图鉴</span>
              <span className="wh-art-index">VOL. {String(year).slice(2)}</span>
            </div>
            <div className="wh-art-stage">
              {mapMounted ? (
                <HeroFootprintMap posts={travelPosts} />
              ) : (
                <div className="wh-map-wait" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
            <div className="wh-art-foot">
              <div className="wh-art-meta">
                <b>
                  {provincesVisitedCount} 省 · {travelPosts.length} 段旅程
                </b>
                <span>从第一次出发，到下一次计划</span>
              </div>
              <Link href="/travel" className="wh-card-more">
                查看足迹
                <IconArrowUpRight />
              </Link>
            </div>
          </TiltCard>
        </section>

        {/* ── 四块桌面网格：最近旅程 / 相册 / 票据 / 旅行圈 ─────────────── */}
        <BentoGrid className="wh-bento">
          <Reveal className="wh-span-7">
            <BentoGridItem
              className="wh-card"
              header={
                <>
                  <div className="wh-card-head">
                    <div>
                      <p className="wh-card-kicker">Recent Journeys</p>
                      <h2 className="wh-card-title">最近旅程</h2>
                    </div>
                    <Link href="/travel" className="wh-card-more">
                      全部旅程
                      <IconArrowRight />
                    </Link>
                  </div>

                  {featured ? (
                    <>
                      <Link href={travelDetailHref(featured.slug)} className="wh-journey-feature">
                        {/* 无封面 / 加载失败时留空，由 .wh-journey-feature 的 --wh-grad-media 渐变兜底 */}
                        <CoverArt src={featured.cover} alt={featured.title} />
                        <span className="wh-journey-scrim" aria-hidden="true" />
                        <span className="wh-journey-caption">
                          <b>{featured.title}</b>
                          <span>
                            {formatDate(featured.date)}
                            {featured.location ? ' · ' + featured.location : ''}
                          </span>
                        </span>
                      </Link>
                      {restJourneys.length > 0 && (
                        <div className="wh-journey-list">
                          {restJourneys.map((post) => (
                            <Link key={post.slug} href={travelDetailHref(post.slug)} className="wh-journey-row">
                              <time>{formatDate(post.date)}</time>
                              <b>{post.title}</b>
                              <em>{post.location || '未标注地点'}</em>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="wh-empty">
                      <IconMapPin />
                      <span>还没有归档的旅程，</span>
                      <Link href="/travel/new" className="wh-card-more">
                        记录第一段
                        <IconArrowRight />
                      </Link>
                    </div>
                  )}
                </>
              }
            />
          </Reveal>

          <Reveal className="wh-span-5" delay={70}>
            <BentoGridItem
              className="wh-card"
              header={
                <>
                  <div className="wh-card-head">
                    <div>
                      <p className="wh-card-kicker">Travel Books</p>
                      <h2 className="wh-card-title">旅行画册</h2>
                    </div>
                    <Link href="/album" className="wh-card-more">
                      书架
                      <IconArrowRight />
                    </Link>
                  </div>

                  {visibleBooks.length > 0 ? (
                    <>
                      <div className="wh-books">
                        {visibleBooks.map((book) => (
                          <Link key={book.bookKey} href={albumDeepLink(book.bookKey)} className="wh-book" title={book.title}>
                            <CoverArt
                              src={book.coverThumb}
                              alt={book.title}
                              fallback={
                                <span className="wh-book-blank" aria-hidden="true">
                                  <IconAlbum />
                                </span>
                              }
                            />
                          </Link>
                        ))}
                      </div>
                      <div className="wh-book-meta">
                        <b>{visibleBooks[0].title}</b>
                        <span>
                          {books.length} 册 · {visibleBooks[0].dayCount} 章 · {visibleBooks[0].photoCount} 图
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="wh-empty">
                      <IconAlbum />
                      <span>还在等第一本画册</span>
                    </div>
                  )}
                </>
              }
            />
          </Reveal>

          <Reveal className="wh-span-5">
            <BentoGridItem
              className="wh-card"
              header={
                <>
                  <div className="wh-card-head">
                    <div>
                      <p className="wh-card-kicker">Tickets</p>
                      <h2 className="wh-card-title">票据夹</h2>
                    </div>
                    <Link href="/tickets" className="wh-card-more">
                      全部票根
                      <IconArrowRight />
                    </Link>
                  </div>

                  {ticketStubs.length > 0 ? (
                    <div className="wh-tickets">
                      {ticketStubs.map((post) => {
                        const md = monthDay(post.date)
                        return (
                          <Link key={post.slug} href="/tickets" className="wh-ticket">
                            <span className="wh-ticket-date">
                              {md.d}
                              <small>{md.m}</small>
                            </span>
                            <span className="wh-ticket-body">
                              <b>{post.title}</b>
                              <span>{post.location || '目的地待补'}</span>
                            </span>
                            <span className="wh-ticket-stamp" aria-hidden="true">
                              <IconTicket />
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="wh-empty">
                      <IconTicket />
                      <span>完成一段旅程，票根会出现在这里</span>
                    </div>
                  )}
                  <div className="wh-card-foot">
                    <span>{travelPosts.length} 张票根 · 随旅程自动生成</span>
                    <Link href="/tickets" className="wh-card-more">
                      整理票根
                      <IconArrowRight />
                    </Link>
                  </div>
                </>
              }
            />
          </Reveal>

          <Reveal className="wh-span-7" delay={70}>
            <BentoGridItem
              className="wh-card"
              header={
                <>
                  <div className="wh-card-head">
                    <div>
                      <p className="wh-card-kicker">Travel Circle</p>
                      <h2 className="wh-card-title">旅行圈</h2>
                    </div>
                    <Link href="/circle" className="wh-card-more">
                      进入旅行圈
                      <IconArrowRight />
                    </Link>
                  </div>

                  {moments.length > 0 ? (
                    <div className="wh-moments">
                      {moments.map((moment) => (
                        <Link key={moment.id} href="/moments" className="wh-moment">
                          <span className="wh-moment-mark" aria-hidden="true">
                            <IconQuote />
                          </span>
                          <span className="wh-moment-body">
                            <p>{moment.content}</p>
                            <span>{relativeTime(moment.createdAt)}</span>
                            {moment.tags && moment.tags.length > 0 ? (
                              <span className="wh-moment-tags">
                                {moment.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="wh-tag">
                                    #{tag}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="wh-empty">
                      <IconCircle />
                      <span>还没有新的碎碎念，</span>
                      <Link href="/moments" className="wh-card-more">
                        去写一条
                        <IconArrowRight />
                      </Link>
                    </div>
                  )}
                  <div className="wh-card-foot">
                    <span>最近 {moments.length} 条 · 来自旅行圈</span>
                    <Link href="/moments" className="wh-card-more">
                      全部碎碎念
                      <IconArrowRight />
                    </Link>
                  </div>
                </>
              }
            />
          </Reveal>
        </BentoGrid>

        {/* ── 每日一言 + 进行中 / 纪念日 ──────────────────────────────── */}
        <Reveal>
          <div className="wh-strip">
            <div className="wh-note">
              <p className="wh-eyebrow">Daily Note · 每日一言</p>
              <p className="wh-note-quote">「{quote}」</p>
              <div className="wh-note-actions">
                <button type="button" className="wh-btn wh-btn-primary" onClick={openDanmaku}>
                  <IconPen />
                  写一句留言
                </button>
                <Link href="/timeline" className="wh-btn wh-btn-ghost">
                  <IconCalendar />
                  回看时间线
                </Link>
              </div>
            </div>

            <div className="wh-note-aside">
              {draftTravels.length > 0 ? (
                draftTravels.slice(0, 2).map((draft) => {
                  const href = travelDetailHref(draft.slug)
                  return (
                    <div key={draft.id} className="wh-mini-card">
                      <span className="wh-mini-mark" aria-hidden="true">
                        <IconSpark />
                      </span>
                      <span className="wh-mini-text">
                        <b>{draft.title}</b>
                        <span>
                          进行中 · {draft.dayCount} 天 · {draft.photoCount} 张照片
                        </span>
                      </span>
                      <button
                        type="button"
                        className="wh-btn wh-btn-ghost wh-btn-mini"
                        onClick={() => void confirmDraft(draft.id)}
                        disabled={archivingId === draft.id}
                      >
                        {archivingId === draft.id ? '归档中' : '完成归档'}
                      </button>
                      <Link href={href} className="wh-mini-link" aria-label={'打开 ' + draft.title}>
                        <IconArrowUpRight />
                      </Link>
                    </div>
                  )
                })
              ) : null}

              {anniversaries.slice(0, 2).map((item: InkAnniversary) => (
                <div key={item.id} className="wh-mini-card">
                  <span className="wh-mini-mark" aria-hidden="true">
                    <IconHeart />
                  </span>
                  <span className="wh-mini-text">
                    <b>{item.title}</b>
                    <span>
                      {item.recurring ? '周年纪念' : '纪念日'} · 还有 {daysUntil(item.date, item.recurring)} 天
                    </span>
                  </span>
                  <Link href="/timeline" className="wh-mini-link" aria-label="去时间线看看">
                    <IconArrowUpRight />
                  </Link>
                </div>
              ))}

              {draftTravels.length === 0 && anniversaries.length === 0 ? (
                <div className="wh-mini-card">
                  <span className="wh-mini-mark" aria-hidden="true">
                    <IconSpark />
                  </span>
                  <span className="wh-mini-text">
                    <b>下一段旅程</b>
                    <span>新建一段旅行，开始记录</span>
                  </span>
                  <Link href="/travel/new" className="wh-mini-link" aria-label="新建旅行">
                    <IconArrowRight />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </Reveal>

        {/* ── 页脚 ─────────────────────────────────────────────────────── */}
        <footer className="wh-foot">
          <span>
            © {year} 甜途 · Ink &amp; Ivory Edition · 记录每一次出发与归来
          </span>
          <span className="wh-foot-links">
            <Link href="/travel">足迹</Link>
            <Link href="/album">画册</Link>
            <Link href="/tickets">票据</Link>
            <Link href="/circle">旅行圈</Link>
            <Link href="/download">下载 App</Link>
          </span>
        </footer>
        <div className="wh-foot-icp">
          <IcpLicense compact numberClassName="wh-foot-link" />
        </div>
      </div>

      {DanmakuHost ? <DanmakuHost ref={danmakuRef} /> : null}
    </div>
  )
}
