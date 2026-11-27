'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Compass, Home, WifiOff, Search } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import SocialFilmCard from '@/components/social/SocialFilmCard'
import { cn } from '@/lib/utils'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { apiUrl } from '@/lib/api-base'
import { circlePostCommentsHref, circlePostHref } from '@/lib/routes'
import { readLocalSocialFeed } from '@/lib/modules/offline/social-read'
import {
  SOCIAL_FEED_CACHE_TTL_MS,
  SOCIAL_FEED_FIRST_RENDER_COUNT,
  canBackgroundFetch,
  getFeedCacheScope,
  isFeedCacheFresh,
  isNetworkOnline,
  normalizeFeedCachePost,
  pruneFeedCachePosts,
  readFeedCache,
  verifyFeedCacheScope,
  writeFeedCache,
  type FeedCachePost,
  type FeedCacheSnapshot,
} from '@/lib/modules/offline/social-feed-cache'
import { SegmentedControl } from '@/components/mobile/SegmentedControl'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { EmptyState } from '@/components/mobile/EmptyState'
import { Skeleton, SkeletonCard } from '@/components/mobile/Skeleton'
import { Stagger } from '@/components/mobile/Stagger'
import { Button } from '@/components/mobile/Button'
import { DesktopOnly, MobileOnly } from '@/components/mobile/MobileOnly'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'
import ErrorBoundary from '@/components/ErrorBoundary'
import { Virtuoso } from 'react-virtuoso'

const TABS = [
  { key: 'recommended', label: '推荐' },
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热门' },
]

/**
 * 两大来源（2026-11-27 用户要求）：
 *   · 全部用户 —— 全站公开的旅行文章/记录（latest / recommended / hot 三种排序）
 *   · 我关注的 —— 只看自己关注的人发布的（API 的 tab=following）
 * 之前「关注」只是四个排序 tab 之一，容易和「最新」混淆；现在提成一级切换。
 */
const SCOPES = [
  { key: 'all', label: '全部用户' },
  { key: 'following', label: '我关注的' },
] as const

/**
 * 同行关系筛选 —— **真实筛选**（travelType 透传到 /api/social/posts）。
 * 此前这里是「海边/周末旅行/摄影」等话题 chips，但 activeTheme 从未接入任何
 * 取数逻辑，点了没有任何效果（误导用户的假 UI，违反规范「Clear」原则）。
 * 现改为按 Travel.travelType 筛选，空 key = 全部。
 */
const TYPE_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'ALONE', label: '独旅' },
  { key: 'COUPLE', label: '与TA' },
  { key: 'FAMILY', label: '与家人' },
  { key: 'FRIENDS', label: '与朋友' },
  { key: 'BFF', label: '与闺蜜' },
  { key: 'GROUP', label: '结伴' },
]
const FRAMES = ['portrait', 'landscape', 'square', 'wide', 'portrait', 'landscape'] as const

/** 每页条数（与 API pageSize 一致；缓存也按这个粒度合并） */
const PAGE_SIZE = 12

// 旅行关系映射（Travel.travelType 枚举 → 卡片叙事文案）
const TRAVEL_RELATION: Record<string, string> = {
  ALONE: '独旅',
  COUPLE: '与TA',
  FAMILY: '与家人',
  FRIENDS: '与朋友',
  BFF: '与闺蜜',
  GROUP: '结伴',
  OTHER: '结伴',
}

interface PostAuthor { id: number; username: string; nickname?: string | null; avatarUrl?: string | null }
interface Post {
  id: number
  travelId?: number | null
  coverUrl: string | null
  title: string
  summary: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  travelType?: string | null
  author: PostAuthor | null
  likeCount: number
  commentCount: number
  favoriteCount: number
  /** 服务端已按当前登录用户回填（social.service attachViewerState）—— 快捷点赞据此显示已赞态 */
  isLiked: boolean
  /** 同上：收藏态也由服务端回填（/api/social/posts 走 attachViewerState） */
  isFavorited: boolean
  /** 排序 / 缓存修剪用；列表本身不展示 */
  publishedAt?: string | null
}

interface FeedPage { data: Post[]; total: number; hasMore: boolean }

/** publishedAt → 毫秒（非法/缺失记 0，排序时落到最旧） */
function postTimeMs(post: { publishedAt?: string | null }): number {
  if (!post.publishedAt) return 0
  const ms = Date.parse(post.publishedAt)
  return Number.isNaN(ms) ? 0 : ms
}

function toCachePost(post: Post): FeedCachePost {
  return {
    id: Number(post.id),
    travelId: post.travelId ?? null,
    title: post.title,
    summary: post.summary,
    coverUrl: post.coverUrl,
    location: post.location,
    startDate: post.startDate,
    endDate: post.endDate,
    dayCount: post.dayCount,
    photoCount: post.photoCount,
    travelType: post.travelType ?? null,
    author: post.author
      ? {
          id: post.author.id,
          username: post.author.username,
          nickname: post.author.nickname ?? null,
          avatarUrl: post.author.avatarUrl ?? null,
        }
      : null,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    favoriteCount: post.favoriteCount,
    isLiked: post.isLiked,
    isFavorited: post.isFavorited,
    publishedAt: post.publishedAt ?? null,
  }
}

function fromCachePost(post: FeedCachePost): Post {
  return {
    id: Number(post.id),
    travelId: post.travelId ?? null,
    coverUrl: post.coverUrl,
    title: post.title,
    summary: post.summary,
    location: post.location,
    startDate: post.startDate,
    endDate: post.endDate,
    dayCount: post.dayCount,
    photoCount: post.photoCount,
    travelType: post.travelType ?? null,
    author: post.author
      ? {
          id: post.author.id,
          username: post.author.username,
          nickname: post.author.nickname ?? null,
          avatarUrl: post.author.avatarUrl ?? null,
        }
      : null,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    favoriteCount: post.favoriteCount,
    isLiked: post.isLiked,
    isFavorited: post.isFavorited,
    publishedAt: post.publishedAt,
  }
}

/**
 * 「温和替换」：新拉到的一页与当前列表按 id 合并。
 * 新数据在前（服务端已按最新排序），仅存在于本地的旧项按原顺序接在后面 ——
 * 既不丢掉用户正在读的旧卡，也不会因为整表替换把滚动位置顶飞。
 */
function mergeVisiblePosts(current: Post[], incoming: Post[]): Post[] {
  const byId = new Map<number, Post>()
  const order: number[] = []
  for (const post of incoming) {
    const id = Number(post.id)
    if (!byId.has(id)) order.push(id)
    byId.set(id, post)
  }
  const merged: Post[] = order.map((id) => byId.get(id) as Post)
  for (const post of current) {
    const id = Number(post.id)
    if (byId.has(id)) continue
    byId.set(id, post)
    merged.push(post)
  }
  return merged
}

/** 追加下一页：按 id 去重（后台预取与滚动加载可能命中同一页） */
function appendUnique(current: Post[], incoming: Post[]): Post[] {
  const seen = new Set(current.map((post) => Number(post.id)))
  const merged = current.slice()
  for (const post of incoming) {
    const id = Number(post.id)
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(post)
  }
  return merged
}

function dateRange(p: Post): string {
  const s = p.startDate ? p.startDate.slice(0, 10) : ''
  const e = p.endDate ? p.endDate.slice(0, 10) : ''
  if (!s && !e) return ''
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    if (isNaN(d.getTime())) return iso
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  // 「2026-01-01 ~ 2026-01-05」这种原始 ISO 串太机械；同年省略年份更贴合中文语境
  if (s && e && s !== e) {
    const sameYear = s.slice(0, 4) === e.slice(0, 4)
    return sameYear ? `${fmt(s)} – ${fmt(e)}` : `${s.slice(0, 4)}年${fmt(s)} – ${fmt(e)}`
  }
  return fmt(s || e)
}

function displayName(a: PostAuthor | null): string {
  return a ? a.nickname || a.username : '旅行者'
}

function relationLabel(p: Post): string | undefined {
  return p.travelType ? TRAVEL_RELATION[p.travelType] : undefined
}

export default function TravelCircleFeed() {
  const router = useRouter()
  const [tab, setTab] = useState('latest')
  /** 内容来源：全部用户 / 我关注的（决定请求 tab=latest 还是 tab=following） */
  const [scope, setScope] = useState<'all' | 'following'>('all')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [offline, setOffline] = useState(false)
  /** 同行关系筛选（'' = 全部）——真实筛选，透传 travelType 给 API */
  const [activeType, setActiveType] = useState('')
  /** 访客态：只读浏览。authChecked 之前不渲染提示，避免登录用户看到一闪而过的横幅 */
  const [loggedIn, setLoggedIn] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  /** 首屏内容来自哪里：cache=本地缓存直出 / network=网络 / local=原生本地表兜底 */
  const [feedSource, setFeedSource] = useState<'cache' | 'network' | 'local' | 'none'>('none')
  /** 本地已缓存篇数（状态条文案用） */
  const [cachedCount, setCachedCount] = useState(0)
  /** 后台正在拉最新/预取（不是阻塞式 loading，只给状态条一个文案） */
  const [refreshing, setRefreshing] = useState(false)

  /* ── 异步逻辑全部走 ref，避免闭包拿到过期 state ─────────────────────────── */
  const postsRef = useRef<Post[]>([])
  const pageRef = useRef(1)
  const hasMoreRef = useRef(false)
  const tabRef = useRef('latest')
  const scopeRef = useRef<'all' | 'following'>('all')
  const typeRef = useRef('')
  const busyRef = useRef(false)
  const loadingMoreRef = useRef(false)
  /** 请求序号：切视图后旧响应一律丢弃，避免「切了 tab 又被上一页覆盖」 */
  const requestSeqRef = useRef(0)
  /** 本地缓存快照（新→旧，最多 60 篇） */
  const cacheRef = useRef<Post[]>([])
  const cachedAtRef = useRef(0)
  /** 当前列表是否由本地缓存分页供给（离线/刷新失败时） */
  const cacheModeRef = useRef(false)
  /** 已经成功拉过的页号（预取去重） */
  const prefetchedRef = useRef<Set<number>>(new Set())
  /** 后台预取并发闸门：最多 1 个 inflight */
  const prefetchInflightRef = useRef(false)
  /** 本次挂载拉到的「页 → 数据」，用于判定「窗口内缺失 = 已下线」 */
  const pagesRef = useRef<Map<number, Post[]>>(new Map())
  /** 后台预取回来的页数据：滚动到该页时直接命中，不重复发请求 */
  const prefetchedPagesRef = useRef<Map<number, FeedPage>>(new Map())
  const firstContentRef = useRef(false)
  /** 列表外层容器：插入新内容前量高度，插入后补滚动，保证不跳屏 */
  const wrapperRef = useRef<HTMLDivElement>(null)
  /** 滚动补偿状态（逐帧校正，见 startScrollCorrection） */
  const correctionRef = useRef<{ baseH: number; startY: number; anchorId: string; anchorTop: number; lastScroll: number; raf: number; frames: number; idle: number } | null>(null)

  const currentFeedTab = useCallback(() => (scopeRef.current === 'following' ? 'following' : tabRef.current), [])

  /** 只有「最新 + 全部用户 + 无类型筛选」这一屏接缓存：关注流/推荐/热门顺序不稳定，缓存会串味 */
  const isCacheEligible = useCallback(
    () => tabRef.current === 'latest' && scopeRef.current === 'all' && typeRef.current === '',
    [],
  )

  /** 同步提交列表（同时刷新 ref，供后续异步逻辑读到最新值） */
  const commitPosts = useCallback((next: Post[]) => {
    postsRef.current = next
    setPosts(next)
  }, [])

  const stopScrollCorrection = useCallback(() => {
    const current = correctionRef.current
    if (!current) return
    if (current.raf) window.cancelAnimationFrame(current.raf)
    correctionRef.current = null
  }, [])

  /** 找一张「完整落在视口里」的卡，作为插入新内容时的滚动锚点（记 id + 屏内 top） */
  const pickScrollAnchor = useCallback((): { id: string; top: number } | null => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null
    const nodes = document.querySelectorAll('[data-feed-post]')
    const limit = window.innerHeight - 80
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i] as HTMLElement
      const rect = node.getBoundingClientRect()
      if (rect.height <= 0) continue
      if (rect.top > 80 && rect.bottom < limit) {
        return { id: node.getAttribute('data-feed-post') || '', top: rect.top }
      }
    }
    return null
  }, [])

  /**
   * 插入新内容后的滚动补偿：逐帧把「用户在读的那张卡」钉回原来的屏内位置。
   *
   * 为什么不用一次性 layout effect：移动端是 react-virtuoso 虚拟列表，
   * 新数据插到顶部后 Virtuoso 的补位/重测发生在它自己的 effect（下一帧），
   * 一次性测量只会拿到 0 偏移，用户照样看到内容整体下移。
   * 锚点被虚拟列表卸载时退回「列表容器高度差」策略；用户一旦自己滚动立即放手。
   */
  const startScrollCorrection = useCallback((start: { baseH: number; startY: number; anchorId: string; anchorTop: number }) => {
    if (typeof window === 'undefined') return
    stopScrollCorrection()
    const state = {
      baseH: start.baseH,
      startY: start.startY,
      anchorId: start.anchorId,
      anchorTop: start.anchorTop,
      lastScroll: start.startY,
      raf: 0,
      frames: 0,
      idle: 0,
    }
    correctionRef.current = state
    const tick = () => {
      const live = correctionRef.current
      if (!live) return
      // 用户自己滚动了：停止校正，不和手势抢滚动
      if (Math.abs(window.scrollY - live.lastScroll) > 2) {
        stopScrollCorrection()
        return
      }
      let corrected = false
      if (live.anchorId) {
        const anchorNode = document.querySelector('[data-feed-post="' + live.anchorId + '"]') as HTMLElement | null
        if (anchorNode) {
          const delta = anchorNode.getBoundingClientRect().top - live.anchorTop
          if (Math.abs(delta) > 1) {
            // 注意：globals.css 开了 scroll-behavior: smooth，必须用 instant，否则每帧补偿都会被动画吃掉
            window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'instant' as ScrollBehavior })
            corrected = true
          }
        } else {
          // 锚点被虚拟列表卸载：退回高度差策略（精度略低但不会撒手不管）
          live.anchorId = ''
        }
      }
      if (!live.anchorId) {
        const el = wrapperRef.current
        const height = el ? el.getBoundingClientRect().height : 0
        const delta = height - live.baseH
        if (Math.abs(delta) > 1) {
          const target = Math.max(0, live.startY + delta)
          if (Math.abs(target - window.scrollY) > 1) {
            window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
            corrected = true
          }
        }
      }
      live.lastScroll = window.scrollY
      live.frames += 1
      live.idle = corrected ? 0 : live.idle + 1
      // 布局稳定后再观察 ~1s（Virtuoso / 卡片重排可能分多帧落地），期间一旦位移继续校正
      if (live.frames < 300 && live.idle < 150) live.raf = window.requestAnimationFrame(tick)
      else stopScrollCorrection()
    }
    state.raf = window.requestAnimationFrame(tick)
  }, [stopScrollCorrection])

  /**
   * 提交列表并（可选）保持滚动位置。
   * keepScroll=true 用于「顶部插入新内容」；追加到列表尾部时不传（append 不改变上方内容位置）。
   */
  const applyPostsKeepingScroll = useCallback((next: Post[], keepScroll: boolean) => {
    const canAnchor = keepScroll && typeof window !== 'undefined' && (window.scrollY || 0) > 8
    const el = wrapperRef.current
    const baseH = canAnchor && el ? el.getBoundingClientRect().height : 0
    const startY = canAnchor ? window.scrollY : 0
    const anchor = canAnchor ? pickScrollAnchor() : null
    commitPosts(next)
    if (canAnchor) {
      startScrollCorrection({
        baseH,
        startY,
        anchorId: anchor ? anchor.id : '',
        anchorTop: anchor ? anchor.top : 0,
      })
    }
  }, [commitPosts, pickScrollAnchor, startScrollCorrection])

  const fetchPage = useCallback(async (feedTabKey: string, targetPage: number, travelType: string): Promise<FeedPage> => {
    const query = new URLSearchParams({ tab: feedTabKey, page: String(targetPage), pageSize: String(PAGE_SIZE) })
    if (travelType) query.set('travelType', travelType)
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller && typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), 15000)
      : null
    try {
      const res = await fetch(apiUrl('/api/social/posts?' + query.toString()), {
        credentials: 'include',
        // 不走浏览器 HTTP 缓存：否则 30s 内「最新」拿到的是缓存响应，状态条显示「后台更新中」却没真更新
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
      })
      if (!res.ok) throw new Error('http ' + res.status)
      const json = (await res.json()) as { data?: Post[]; total?: number; hasMore?: boolean; success?: boolean; error?: string } | null
      if (!json || json.success === false) throw new Error(json?.error || 'bad payload')
      return {
        data: Array.isArray(json.data) ? json.data : [],
        total: Number(json.total) || 0,
        hasMore: !!json.hasMore,
      }
    } finally {
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  /** 把一页写进本地缓存（与已有缓存合并 + 容量收敛），并同步内存里的缓存快照 */
  const persistCache = useCallback(async (items: Post[], totalNow?: number | null) => {
    if (!isCacheEligible() || items.length === 0) return
    try {
      const snapshot = await writeFeedCache(items.map(toCachePost), { total: totalNow })
      if (!snapshot) return
      cacheRef.current = snapshot.items.map(fromCachePost)
      cachedAtRef.current = snapshot.cachedAt
      setCachedCount(snapshot.items.length)
    } catch {
      // 缓存写失败不影响阅读；下次打开会重新拉
    }
  }, [isCacheEligible])

  /**
   * 从缓存里剔除「已删除 / 已下架」的帖子。
   * 判定依据：本次连续拉取的页 1..k 覆盖了 publishedAt 区间 (oldest, ∞)，
   * 缓存里落在这个区间却不在结果中的项 = 服务端不再返回（下架/删除/被屏蔽）。
   * 用严格 > 边界，避免 publishedAt 相同的文章跨页并列时被误删。
   */
  const pruneOfflineGone = useCallback(async () => {
    if (!isCacheEligible()) return
    const pages = pagesRef.current
    const keepIds = new Set<number>()
    let oldest = 0
    let probe = 1
    while (pages.has(probe) && probe <= 6) {
      const items = pages.get(probe) as Post[]
      for (const post of items) keepIds.add(Number(post.id))
      const last = items[items.length - 1]
      const lastMs = last ? postTimeMs(last) : 0
      if (lastMs > 0) oldest = oldest > 0 ? Math.min(oldest, lastMs) : lastMs
      probe += 1
    }
    if (keepIds.size === 0 || oldest <= 0) return
    try {
      const removed = await pruneFeedCachePosts({ keepIds, newerThanMs: oldest })
      if (removed <= 0) return
      cacheRef.current = cacheRef.current.filter(
        (post) => !(postTimeMs(post) > oldest && !keepIds.has(Number(post.id))),
      )
      setCachedCount(cacheRef.current.length)
    } catch {
      // 剔除失败不影响阅读；下次刷新再试
    }
  }, [isCacheEligible])

  /**
   * 后台预取第 N 页并写缓存（渐进式缓存的核心）。
   * 约束：最多 1 个 inflight、离线/省流量跳过、同一页只拉一次、切视图后丢弃结果。
   */
  const prefetchPage = useCallback(async (target: number) => {
    if (target < 2 || !isCacheEligible()) return
    if (prefetchInflightRef.current) return
    if (!canBackgroundFetch()) return
    if (prefetchedRef.current.has(target)) return
    prefetchedRef.current.add(target)
    prefetchInflightRef.current = true
    const seq = requestSeqRef.current
    try {
      const json = await fetchPage(currentFeedTab(), target, typeRef.current)
      if (seq !== requestSeqRef.current) return
      const items = json.data || []
      if (items.length === 0) return
      pagesRef.current.set(target, items)
      prefetchedPagesRef.current.set(target, json)
      await persistCache(items, json.total)
      await pruneOfflineGone()
    } catch {
      prefetchedRef.current.delete(target) // 失败允许下次重试
    } finally {
      prefetchInflightRef.current = false
    }
  }, [currentFeedTab, fetchPage, isCacheEligible, persistCache, pruneOfflineGone])

  /**
   * 拉第一页并温和替换。
   * 网络失败时保留已渲染的缓存内容（绝不把用户正在看的内容清空）；
   * 只有在完全没内容时才做原生本地表兜底 / 报错。
   */
  const refreshFirstPage = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    const seq = ++requestSeqRef.current
    setError('')
    setRefreshing(true)
    try {
      const json = await fetchPage(currentFeedTab(), 1, typeRef.current)
      if (seq !== requestSeqRef.current) return
      const data = json.data || []
      const atTop = typeof window === 'undefined' || (window.scrollY || 0) <= 8
      if (atTop || postsRef.current.length === 0) {
        applyPostsKeepingScroll(data, false)
        pageRef.current = 1
        setHasMore(!!json.hasMore)
        hasMoreRef.current = !!json.hasMore
        setTotal(json.total || 0)
      } else {
        applyPostsKeepingScroll(mergeVisiblePosts(postsRef.current, data), true)
        const more = !!json.hasMore || postsRef.current.length > data.length
        setHasMore(more)
        hasMoreRef.current = more
        if (json.total) setTotal((prev) => Math.max(prev, json.total as number))
        pageRef.current = 1
      }
      cacheModeRef.current = false
      pagesRef.current = new Map([[1, data]])
      setFeedSource('network')
      setOffline(false)
      setLoading(false)
      await persistCache(data, json.total)
      await pruneOfflineGone()
      // 首屏落地后，后台继续缓存后续：TTL 内且缓存已有两页 → 省掉这次请求
      const fresh = isFeedCacheFresh(cachedAtRef.current, SOCIAL_FEED_CACHE_TTL_MS)
      if (json.hasMore && !(fresh && cacheRef.current.length > PAGE_SIZE)) void prefetchPage(2)
    } catch {
      if (seq !== requestSeqRef.current) return
      if (postsRef.current.length === 0) {
        // 完全没有内容：原生端尝试本地表兜底（Web 端这里必然是 null）
        const local = await readLocalSocialFeed({ limit: SOCIAL_FEED_FIRST_RENDER_COUNT })
        const localPosts: Post[] = []
        for (const item of local || []) {
          // 本地表行的形状由 normalize 兜一层（缺列/脏数据不至于让整屏崩掉）
          const normalized = normalizeFeedCachePost(item)
          if (normalized) localPosts.push(fromCachePost(normalized))
        }
        if (localPosts.length > 0) {
          cacheRef.current = localPosts
          setCachedCount(localPosts.length)
          cacheModeRef.current = true
          setHasMore(true)
          hasMoreRef.current = true
          applyPostsKeepingScroll(localPosts.slice(0, SOCIAL_FEED_FIRST_RENDER_COUNT), false)
          setFeedSource('local')
        } else {
          setError('网络错误')
        }
      } else {
        // 有缓存内容：静默失败，滚动时继续用缓存兜底
        cacheModeRef.current = cacheRef.current.length > postsRef.current.length
      }
      setOffline(true)
    } finally {
      if (seq === requestSeqRef.current) {
        busyRef.current = false
        setRefreshing(false)
        setLoading(false)
      }
    }
  }, [applyPostsKeepingScroll, currentFeedTab, fetchPage, persistCache, prefetchPage, pruneOfflineGone])

  /** 把一份缓存快照铺到首屏（8–10 篇），剩下的等滚动 / 网络补 */
  const applyCacheSnapshot = useCallback((snapshot: FeedCacheSnapshot): boolean => {
    if (!snapshot || snapshot.items.length === 0) return false
    const cached = snapshot.items.map(fromCachePost)
    cacheRef.current = cached
    cachedAtRef.current = snapshot.cachedAt
    cacheModeRef.current = true
    setCachedCount(cached.length)
    setHasMore(true)
    hasMoreRef.current = true
    if (snapshot.total != null) setTotal(snapshot.total)
    applyPostsKeepingScroll(cached.slice(0, SOCIAL_FEED_FIRST_RENDER_COUNT), false)
    setFeedSource('cache')
    setLoading(false)
    return true
  }, [applyPostsKeepingScroll])

  /** 读缓存并直出（切换视图时用；账号作用域已在首屏校验过） */
  const renderFromCache = useCallback(async (): Promise<boolean> => {
    if (!isCacheEligible()) return false
    const snapshot = await readFeedCache()
    if (!snapshot) return false
    return applyCacheSnapshot(snapshot)
  }, [applyCacheSnapshot, isCacheEligible])

  /** 切视图（tab / 来源 / 类型筛选）：重置列表；回到默认视图时仍然是「缓存先出、网络后补」 */
  const changeView = useCallback(async (next: { tab?: string; scope?: 'all' | 'following'; type?: string }) => {
    const nextTab = next.tab ?? tabRef.current
    const nextScope = next.scope ?? scopeRef.current
    const nextType = next.type ?? typeRef.current
    tabRef.current = nextTab
    scopeRef.current = nextScope
    typeRef.current = nextType
    setTab(nextTab)
    setScope(nextScope)
    setActiveType(nextType)

    requestSeqRef.current += 1
    busyRef.current = false
    cacheModeRef.current = false
    prefetchedRef.current = new Set()
    pagesRef.current = new Map()
    prefetchedPagesRef.current = new Map()
    stopScrollCorrection()
    commitPosts([])
    pageRef.current = 1
    hasMoreRef.current = false
    setHasMore(false)
    setTotal(0)
    setError('')
    setFeedSource('none')
    setLoading(true)
    setCachedCount(cacheRef.current.length)

    await renderFromCache()
    await refreshFirstPage()
  }, [commitPosts, refreshFirstPage, renderFromCache, stopScrollCorrection])

  /** 滚动到接近底部 / 虚拟列表触底：优先用本地缓存补齐，缓存耗尽再联网取下一页 */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    if (busyRef.current && postsRef.current.length === 0) return

    if (cacheModeRef.current) {
      const buffer = cacheRef.current
      const currentCount = postsRef.current.length
      if (currentCount >= buffer.length) {
        setHasMore(false)
        hasMoreRef.current = false
        if (canBackgroundFetch()) void refreshFirstPage()
        return
      }
      const nextCount = Math.min(buffer.length, currentCount + SOCIAL_FEED_FIRST_RENDER_COUNT)
      loadingMoreRef.current = true
      setLoadingMore(true)
      applyPostsKeepingScroll(buffer.slice(0, nextCount), false)
      loadingMoreRef.current = false
      setLoadingMore(false)
      const stillMore = nextCount < buffer.length
      setHasMore(stillMore)
      hasMoreRef.current = stillMore
      if (!stillMore && canBackgroundFetch()) void refreshFirstPage()
      return
    }

    if (!hasMoreRef.current) return
    const nextPage = pageRef.current + 1
    // 预取命中：这一页后台已经拉过并落盘，直接铺出来（“边看边缓存”的收益就在这里）
    const prefetched = prefetchedPagesRef.current.get(nextPage)
    if (prefetched) {
      prefetchedPagesRef.current.delete(nextPage)
      applyPostsKeepingScroll(appendUnique(postsRef.current, prefetched.data), false)
      pageRef.current = nextPage
      setHasMore(!!prefetched.hasMore)
      hasMoreRef.current = !!prefetched.hasMore
      if (prefetched.total) setTotal(prefetched.total)
      if (prefetched.hasMore && canBackgroundFetch()) void prefetchPage(nextPage + 1)
      return
    }
    loadingMoreRef.current = true
    setLoadingMore(true)
    const seq = requestSeqRef.current
    try {
      const json = await fetchPage(currentFeedTab(), nextPage, typeRef.current)
      if (seq !== requestSeqRef.current) return
      const data = json.data || []
      applyPostsKeepingScroll(appendUnique(postsRef.current, data), false)
      pageRef.current = nextPage
      setHasMore(!!json.hasMore)
      hasMoreRef.current = !!json.hasMore
      if (json.total) setTotal(json.total)
      pagesRef.current.set(nextPage, data)
      await persistCache(data, json.total)
      await pruneOfflineGone()
      // 用户正在读第 N 页 → 后台预取第 N+1 页，滚动跟进时直接命中
      if (json.hasMore && canBackgroundFetch()) void prefetchPage(nextPage + 1)
    } catch {
      if (seq !== requestSeqRef.current) return
      cacheModeRef.current = cacheRef.current.length > postsRef.current.length
      if (!cacheModeRef.current) {
        setHasMore(false)
        hasMoreRef.current = false
      }
      if (!isNetworkOnline()) setOffline(true)
    } finally {
      if (seq === requestSeqRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [applyPostsKeepingScroll, currentFeedTab, fetchPage, persistCache, prefetchPage, pruneOfflineGone, refreshFirstPage])

  // 首次挂载：缓存直出 → 账号作用域校验（并行）→ 后台拉最新第一页
  useEffect(() => {
    let alive = true
    void (async () => {
      /**
       * 账号隔离优先：**有缓存时先确认「这份缓存属于当前账号」再铺**。
       *  - 在线：等 /api/me 的结果（真实网络几十~几百 ms；上限 1.5s 防挂死）；
       *  - 离线：/api/me 立刻失败，按离线优先直接铺缓存（此时无法校验，宁可离线可用）；
       *  - 没有缓存：不用等校验（无内容可串号），校验转后台，避免多付一次 RTT。
       */
      const snapshot = isCacheEligible() ? await readFeedCache() : null
      const scopeTask = verifyFeedCacheScope()
      if (snapshot) {
        const scopeCap = new Promise<'timeout'>((resolve) => {
          window.setTimeout(() => resolve('timeout'), isNetworkOnline() ? 1500 : 800)
        })
        const scopeResult = await Promise.race([scopeTask, scopeCap])
        if (!alive) return
        /**
         * 双保险：除了校验结果，还要求「快照里的 scope 仍等于当前本地标记」。
         * 为什么需要：React 严格模式（dev）会把挂载 effect 跑两遍 —— 第一遍的
         * /api/me 校验已经把旧 scope 清掉并改成新账号，第二遍拿到的校验结果是 'ok'，
         * 但它手里那份快照是校验前读的（属于上一个账号）。只按结果判断会把它铺出来。
         */
        const scopeStillMatches = snapshot.scope === getFeedCacheScope()
        if (scopeResult === 'switched' || scopeResult === 'guest' || !scopeStillMatches) {
          // 换号/登出：刚读到的缓存属于上一个账号，绝不能铺（串号）
          cacheRef.current = []
          cachedAtRef.current = 0
          cacheModeRef.current = false
          setCachedCount(0)
          commitPosts([])
          setFeedSource('none')
          setLoading(true)
          setTotal(0)
        } else {
          applyCacheSnapshot(snapshot)
        }
      } else {
        // 后台校验（换号时把上一个账号的缓存清掉，不影响本次网络首屏）
        void scopeTask.then((result) => {
          if (!alive || (result !== 'switched' && result !== 'guest')) return
          cacheRef.current = []
          cachedAtRef.current = 0
          setCachedCount(0)
        }).catch(() => {})
      }
      if (!alive) return
      // 离线时不必打一发注定失败的请求（内容已经由缓存直出）；恢复网络由 online 事件补拉
      if (isNetworkOnline()) await refreshFirstPage()
    })()
    return () => {
      alive = false
      requestSeqRef.current += 1
    }
  }, [applyCacheSnapshot, commitPosts, isCacheEligible, refreshFirstPage])

  // 卸载时停掉还没跑完的滚动补偿（避免对已卸载页面 scrollTo）
  useEffect(() => () => stopScrollCorrection(), [stopScrollCorrection])

  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setLoggedIn(!!j.authenticated)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setAuthChecked(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // 网络恢复：后台补最新 + 预取下一页；断网：标记离线（内容继续用缓存渲染）
  useEffect(() => {
    const handleOnline = () => {
      setOffline(false)
      void refreshFirstPage()
      if (isCacheEligible()) void prefetchPage(2)
    }
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!isNetworkOnline()) setOffline(true)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isCacheEligible, prefetchPage, refreshFirstPage])

  /** 首屏内容可见的实测点：只记第一次（验收脚本读 window.__circleFeedFirstContent） */
  useEffect(() => {
    if (posts.length === 0 || firstContentRef.current) return
    firstContentRef.current = true
    try {
      const at = Math.round(typeof performance !== 'undefined' ? performance.now() : 0)
      if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        performance.mark('circle-feed-first-content')
      }
      const w = window as unknown as {
        __circleFeedFirstContent?: { at: number; source: string; count: number }
      }
      w.__circleFeedFirstContent = { at, source: feedSource, count: posts.length }
    } catch {
      // 诊断失败不影响渲染
    }
  }, [posts.length, feedSource])

  const switchTab = (t: string) => { void changeView({ tab: t }) }
  const switchScope = (s: 'all' | 'following') => { void changeView({ scope: s }) }
  const changeType = (type: string) => { void changeView({ type }) }

  // 无限滚动：哨兵进入视口自动加载下一页（手动「加载更多」保留作兜底）
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore()
      },
      { rootMargin: '400px 0px 0px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadingMore, loading, tab, activeType, loadMore])

  const hero = posts[0]
  // 移动端 hero 单独渲染；虚拟列表必须从第二篇开始，避免同一篇出现两次。
  const mobileListPosts = posts.slice(1)

  const cardProps = (p: Post, frame: (typeof FRAMES)[number] = 'portrait') => ({
    coverUrl: p.coverUrl,
    cityName: p.location || undefined,
    title: p.title,
    summary: p.summary,
    dateRange: dateRange(p),
    dayCount: p.dayCount,
    photoCount: p.photoCount,
    location: p.location || undefined,
    travelRelation: relationLabel(p),
    author: p.author ? { name: displayName(p.author), avatar: p.author.avatarUrl || null } : null,
    // 点赞不再是只读数字：卡片上直接可点（不必进详情页）
    postId: p.id,
    liked: p.isLiked,
    likeCount: p.likeCount,
    // 访客点击快捷点赞 → 引导登录，不发无效请求（与上方访客横幅同一规则）
    likeLoginHref: authChecked && !loggedIn ? '/login?redirect=%2Fcircle' : undefined,
    // 收藏同理：列表上就能收藏（"稍后再看"的决定恰恰发生在浏览列表时）
    favorited: p.isFavorited,
    favoriteCount: p.favoriteCount,
    favoriteLoginHref: authChecked && !loggedIn ? '/login?redirect=%2Fcircle' : undefined,
    // 评论数是入口：直接打开详情页的评论抽屉（带 ?comments=1，详情页读它自动展开）
    onOpenComments: () => {
      const href = circlePostCommentsHref(p.id)
      if (href) router.push(href)
    },
    stats: { comments: p.commentCount, bookmarks: p.favoriteCount },
    frame,
    // 统一入口：id 缺失时不跳 /circle/undefined（R2 路由加固）
    onOpen: () => {
      const href = circlePostHref(p.id)
      if (href) router.push(href)
    },
  })

  /** 极轻的缓存状态：不打断阅读、不盖内容、不转圈 */
  const cacheHint = cachedCount > 0
    ? refreshing
      ? `已缓存 ${cachedCount} 篇 · 后台更新中`
      : offline
        ? `离线 · 已缓存 ${cachedCount} 篇`
        : `已缓存 ${cachedCount} 篇`
    : ''

  return (
    <MobilePageShell
      className="bg-[var(--ui-social-bg)] text-[var(--ui-social-text)]"
      contentClassName="relative mx-auto max-w-6xl px-4 pb-8 sm:px-6 sm:pt-8"
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] overflow-hidden bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(232,179,106,0.10),transparent_65%),radial-gradient(40%_40%_at_100%_0%,rgba(126,147,173,0.06),transparent_60%)]" />
        <PullToRefresh onRefresh={() => refreshFirstPage()}>
        <header className="m-enter mb-7 hidden items-start justify-between gap-4 md:flex">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ui-social-accent)]">Travel Circle</p>
            <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight text-[var(--ui-social-text)]">旅行圈</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ui-social-muted)]">看看别人眼中的世界，发现正在发生的旅途。</p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <SocialThemeToggle />
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ui-social-surface)] px-4 py-2 text-sm text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] transition hover:text-[var(--ui-social-text)] hover:ring-[var(--ui-social-line-strong)]">
              <Icon icon={Home} size="sm" />返回首页
            </Link>
          </div>
        </header>

        {/* 移动端：与 Demo 一致的眉标 + 大标题 + 搜索 / 明暗切换 */}
        {/* 顶部安全区由 MobilePageShell 统一提供，这里不再叠加 m-safe-top，
            否则比首页/旅程多出一段，右上角图标整体下沉 */}
        <header className="flex items-start gap-3 px-[18px] pb-3 md:hidden">
          <div className="min-w-0 flex-1">
            <p className="m2-eyebrow">甜途 · 旅行圈</p>
            <h1 className="m2-page-title">旅行圈</h1>
            <p className="m2-page-sub">看看别人眼中的世界，发现正在发生的旅途。</p>
          </div>
          <Link
            href="/search"
            aria-label="搜索旅行圈"
            className="m-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ui-social-surface)] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)]"
          >
            <Icon icon={Search} size="md" />
          </Link>
          <div className="shrink-0">
            <SocialThemeToggle />
          </div>
        </header>

        {offline && (
          <div className="mb-6 flex items-center justify-center gap-1.5 rounded-full bg-[var(--ui-social-accent-soft)] px-4 py-1.5 text-xs text-[var(--ui-social-accent)]">
            <Icon icon={WifiOff} size="sm" />
            离线模式：显示已缓存的旅行圈内容
          </div>
        )}

        {/* 内容来源：全部用户 / 我关注的 */}
        <div className="mb-3 md:hidden">
          <SegmentedControl
            value={scope}
            options={SCOPES.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(v) => switchScope(v as 'all' | 'following')}
          />
        </div>

        {scope === 'all' && (
          <div className="mb-4 md:hidden">
            <SegmentedControl
              value={tab}
              options={TABS.map((t) => ({ value: t.key, label: t.label }))}
              onChange={switchTab}
            />
          </div>
        )}

        <div className="m-safe-inset-top-10 sticky z-20 mb-3 -mx-4 hidden gap-2 px-4 pb-1 pt-1 backdrop-blur-sm md:flex">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => switchScope(s.key)}
              aria-pressed={scope === s.key}
              className={cn(
                'shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition active:scale-95',
                scope === s.key
                  ? 'bg-[var(--ui-social-accent)] text-[var(--ui-social-on-accent)] shadow-[0_8px_18px_-8px_var(--ui-social-accent)]'
                  : 'bg-[var(--ui-social-surface)] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] hover:text-[var(--ui-social-text)]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {scope === 'all' && (
        <div className="m-safe-inset-top-10 sticky z-20 mb-4 -mx-4 hidden gap-2 overflow-x-auto px-4 pb-2 pt-1 backdrop-blur-sm md:flex [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => switchTab(t.key)}
              className={cn('shrink-0 rounded-full px-4 py-2 text-sm transition active:scale-95',
                tab === t.key ? 'bg-[var(--ui-social-accent)] text-[var(--ui-social-on-accent)] shadow-[0_8px_18px_-8px_var(--ui-social-accent)]' : 'bg-[var(--ui-social-surface)] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] hover:text-[var(--ui-social-text)]')}>
              {t.label}
            </button>
          ))}
        </div>
        )}

        {/*
          同行关系筛选（C1 精修）：替换早期纯装饰的话题 chips —— 那排「海边/周末旅行」
          从未接入取数逻辑，点了没有任何效果。现在按 Travel.travelType 真实筛选，
          且 chips 样式统一走 m-chip token（不再裸写 border/ring）。
        */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TYPE_FILTERS.map((filter) => {
            const active = activeType === filter.key
            return (
              <button
                key={filter.key || 'all'}
                type="button"
                onClick={() => changeType(filter.key)}
                aria-pressed={active}
                className={cn('m-chip min-h-[44px] shrink-0 px-4', active && 'm-chip-active')}
              >
                {filter.label}
              </button>
            )
          })}
        </div>

        {/* 访客提示：能看，但互动要登录 —— 先说清楚，而不是让用户点了才发现 */}
        {!authChecked ? null : !loggedIn ? (
          <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-[var(--ui-social-accent-soft)] px-4 py-3">
            <Icon icon={Compass} size="sm" className="shrink-0 text-[var(--ui-social-accent)]" />
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--ui-social-accent)]">
              你现在是访客，登录后能点赞、评论和分享。
            </p>
            <Link
              href="/login?redirect=%2Fcircle"
              className="shrink-0 rounded-full bg-[var(--ui-social-accent)] px-3.5 py-1.5 text-xs font-medium text-[var(--ui-social-on-accent)]"
            >
              去登录
            </Link>
          </div>
        ) : null}

        {loading && posts.length === 0 ? (
          <>
            <div className="hidden flex-col items-center gap-3 py-28 text-[var(--ui-social-muted)] md:flex"><Icon icon={Loader2} size="lg" tone="accent" className="animate-spin" /><span className="text-sm">正在翻阅旅行相册…</span></div>
            <div className="space-y-4 md:hidden">
              <Skeleton className="h-72 w-full" style={{ borderRadius: 26 }} />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </>
        ) : error && posts.length === 0 ? (
          <>
            <div className="hidden py-20 text-center text-sm text-[var(--ui-social-muted)] md:block">{error}</div>
            <div className="md:hidden">
              <EmptyState
                icon={WifiOff}
                title="网络开小差了"
                description={error}
                action={
                  <Button variant="secondary" onClick={() => void refreshFirstPage()}>
                    重新加载
                  </Button>
                }
              />
            </div>
          </>
        ) : posts.length === 0 ? (
          <>
          <div className="relative hidden overflow-hidden rounded-[2rem] bg-[var(--ui-social-surface-60)] px-6 py-28 text-center ring-1 ring-[var(--ui-social-line)] md:block">
            <div className="absolute inset-0 bg-[radial-gradient(40%_50%_at_50%_30%,rgba(232,179,106,0.08),transparent_70%)]" />
            <div className="relative">
              <Icon icon={Compass} size="lg" tone="accent" className="mx-auto" />
              <p className="mt-4 text-base text-[var(--ui-social-text)]">
                {scope === 'following' ? '关注的人还没有发布旅行。' : '这里还没有故事。'}
              </p>
              <button
                type="button"
                onClick={() => (scope === 'following' ? switchScope('all') : router.push('/travel'))}
                className="mt-6 rounded-full bg-[var(--ui-social-accent)] px-6 py-2.5 text-sm font-medium text-[var(--ui-social-on-accent)]"
              >
                {scope === 'following' ? '看全部用户' : '去我的旅行'}
              </button>
            </div>
          </div>
          <div className="md:hidden">
            <EmptyState
              icon={Compass}
              title={
                scope === 'following'
                  ? '关注的人还没有发布旅行'
                  : activeType
                    ? '这个类型下还没有故事'
                    : '这里还没有故事'
              }
              description={
                scope === 'following'
                  ? '去旅行圈关注喜欢的旅行者，他们的新故事会出现在这里。'
                  : !loggedIn && !activeType
                    ? '登录后可以翻看大家公开的旅行记录。'
                    : undefined
              }
              action={
                scope === 'following' ? (
                  <Button variant="secondary" onClick={() => switchScope('all')}>
                    看全部用户
                  </Button>
                ) : activeType ? (
                  <Button variant="secondary" onClick={() => changeType('')}>
                    看全部
                  </Button>
                ) : (
                  <Button
                    onClick={() => router.push(loggedIn ? '/travel' : '/login?redirect=%2Fcircle')}
                  >
                    {loggedIn ? '去我的旅行' : '去登录'}
                  </Button>
                )
              }
            />
          </div>
          </>
        ) : (
          <>
            {/*
              UI 精修（R3）：加一条「共 N 篇」的段落头 —— 首屏现在能一眼看出
              这是列表而不是一屏孤零零的卡；同时把 hero 与瀑布流之间的间距收紧
              （mb-8 → mb-5），手机上一屏能看到 hero + 半张卡，滚动意图更明确。
              P2 预缓存：右侧再挂一个极轻的「已缓存 N 篇 · 后台更新中」状态
              （无 spinner、无遮罩，不打断阅读）。
            */}
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm font-semibold tracking-wide text-[var(--ui-social-text)]">
                {scope === 'following' ? '关注的旅途' : tab === 'recommended' ? '推荐旅途' : tab === 'hot' ? '热门旅途' : '最新旅途'}
              </span>
              <span className="h-px flex-1 bg-[var(--ui-social-line)]" />
              {cachedCount > 0 && (
                <span
                  data-testid="feed-cache-status"
                  data-source={feedSource}
                  data-cached={cachedCount}
                  data-rendered={posts.length}
                  data-total={total}
                  data-refreshing={refreshing ? '1' : '0'}
                  className="inline-flex shrink-0 items-center gap-1.5 text-[11px] leading-none text-[var(--ui-social-muted)]"
                >
                  <span aria-hidden="true" className="inline-block h-1 w-1 rounded-full bg-[var(--ui-social-accent)] opacity-60" />
                  {cacheHint}
                </span>
              )}
              {total > 0 && <span className="text-xs tabular-nums text-[var(--ui-social-muted)]">共 {total} 篇</span>}
            </div>

            {/* 列表外层容器：插入新内容时量高度差补滚动（P2 不跳屏） */}
            <div ref={wrapperRef} data-testid="feed-list-wrapper">
            {/* 移动端：hero 大图 + **真虚拟列表**（react-virtuoso）。
                无限滚动此前只累加分页结果，长刷后数百张图卡片常驻 DOM，低端 WebView 必然掉帧
                （评审 P-10）。Virtuoso 只保留视口附近的卡片，滚过的卡片卸载、占位高度保留。
                入场 Stagger 动画在虚拟化下会随重挂载重放，故虚拟列表内不使用；桌面瀑布流不受影响。 */}
            <ErrorBoundary
              label="TravelCircleMobileFeed"
              fallback={(
                <div role="alert" className="rounded-2xl bg-[var(--ui-social-surface)] p-6 text-center ring-1 ring-[var(--ui-social-line)]">
                  <p className="text-sm font-medium text-[var(--ui-social-text)]">这部分旅行内容暂时无法显示</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ui-social-muted)]">页面其它区域仍可浏览，请刷新后再试。</p>
                </div>
              )}
            >
            <MobileOnly>
              {hero && <SocialFilmCard {...cardProps(hero, 'wide')} variant="hero" className="m-enter mb-5" />}
              {mobileListPosts.length > 0 && (
                <Virtuoso
                  useWindowScroll
                  increaseViewportBy={{ top: 600, bottom: 900 }}
                  data={mobileListPosts}
                  itemContent={(i, p) => (
                    // data-feed-post 只用于滚动锚点定位（插入新内容时不跳屏）
                    <div data-feed-post={p.id}>
                      <SocialFilmCard
                        key={p.id}
                        {...cardProps(p, FRAMES[i % FRAMES.length])}
                        className="mb-5"
                      />
                    </div>
                  )}
                  endReached={() => void loadMore()}
                />
              )}
              <div className="mt-6 flex justify-center pb-2">
                {loadingMore ? (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--ui-social-muted)]">
                    <Icon icon={Loader2} size="sm" className="animate-spin" />
                    正在加载更多…
                  </span>
                ) : (
                  !hasMore && (
                    <span className="text-xs text-[var(--ui-social-muted)]">看到这里就是全部了 · 共 {posts.length} 篇</span>
                  )
                )}
              </div>
            </MobileOnly>
            </ErrorBoundary>

            {/* 桌面端：CSS 多列瀑布流（列数少、资源充裕，保持 Stagger 入场；不做虚拟化） */}
            <DesktopOnly>
              <Stagger className="m-enter columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]" delayBase={60} step={36}>
                {posts.map((p, i) => (
                  <SocialFilmCard
                    key={p.id}
                    {...cardProps(p, FRAMES[i % FRAMES.length])}
                    className={cn('mb-5 break-inside-avoid m-cv-auto', hero && p.id === hero.id && 'hidden')}
                  />
                ))}
              </Stagger>
              <div ref={sentinelRef} className="mt-6 flex justify-center">
                {loadingMore ? (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--ui-social-muted)]">
                    <Icon icon={Loader2} size="sm" className="animate-spin" />
                    正在加载更多…
                  </span>
                ) : hasMore ? (
                  <button type="button" onClick={() => void loadMore()}
                    className="m-pressable rounded-full bg-[var(--ui-social-surface)] px-6 py-2.5 text-sm text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] transition-colors hover:text-[var(--ui-social-text)] hover:ring-[var(--ui-social-line-strong)]">
                    加载更多
                  </button>
                ) : (
                  posts.length > 0 && (
                    <span className="text-xs text-[var(--ui-social-muted)]">看到这里就是全部了 · 共 {posts.length} 篇</span>
                  )
                )}
              </div>
            </DesktopOnly>
            </div>
          </>
        )}
        </PullToRefresh>
    </MobilePageShell>
  )
}
