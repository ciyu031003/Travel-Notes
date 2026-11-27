'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamicImport from 'next/dynamic'
import { apiFetch } from '@/lib/client/api'
import { apiUrl } from '@/lib/api-base'
import HomeMobile from '@/components/HomeMobile'
import HomeLoading from '@/components/HomeLoading'
import AsyncState from '@/components/AsyncState'
import { HomeMobileError } from '@/components/HomeMobileStates'
import {
  createLocalFirstStore,
  localFirst,
  onLocalFirstScopeChange,
  readLocalFirstSync,
  scheduleLocalFirstScopeCheck,
  type LocalFirstConfigBase,
} from '@/lib/modules/offline/local-first'
import { useIsomorphicLayoutEffect } from '@/lib/client/persisted-cache'
import type { HomeData } from '@/lib/home/home-data'

/**
 * 桌面首页树按需加载（2026-11-23 性能专项，移动端首屏 JS 瘦身）。
 *
 * 背景：HomePageClient 原先静态 import 了 HomeClient（桌面树：弹幕区 / 碎片条 /
 * 各种图表小件）。移动端虽然用 CSS 隐藏了它，但**代码照样进了路由 chunk 并被解析** ——
 * 实测首页首屏 JS ≈476KB(gz)，比 /me 多近 200KB，其中很大一块就是这个永远不显示的桌面树。
 *
 * 处理：
 *  · 改成 dynamic import（ssr 默认 true）→ 单独 chunk，Web 端桌面 SSR 行为不变；
 *  · 移动静态壳（NEXT_PUBLIC_APP_PLATFORM=mobile，构建期注入）里**根本不渲染桌面树**，
 *    于是那个 chunk 永远不会被请求 —— 首屏 JS 直接少一整块。
 * Web 构建（未注入该变量）行为与改动前完全一致（桌面 CSS 显隐 + 移动 CSS 显隐都在）。
 */
const HomeClient = dynamicImport(() => import('@/components/HomeClient'))
const IS_MOBILE_SHELL = process.env.NEXT_PUBLIC_APP_PLATFORM === 'mobile'

/** 软新鲜期：首页 5 分钟内重复打开直接读本地（后台仍静默校准一次） */
const HOME_TTL_MS = 5 * 60 * 1000
/** 硬新鲜期：超过 24h 视为「必须先看云端」（失败仍回退本地） */
const HOME_HARD_TTL_MS = 24 * 60 * 60 * 1000
/** 缓存结构版本：HomeData 形状变更时 +1，旧缓存自动失效 */
const HOME_CACHE_SCHEMA_VERSION = 1

/**
 * 首页数据结构校验：缓存/云端返回的数据必须过这一关才进渲染。
 * 为什么需要：本地缓存可能是旧版本 App 写下的（字段改名/删字段），直接渲染会在
 * 组件深处报「cannot read property of undefined」—— 整页白屏，比没有缓存更糟。
 */
function isHomeData(value: unknown): value is HomeData {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    Array.isArray(data.travelPosts) &&
    Array.isArray(data.draftTravels) &&
    Array.isArray(data.anniversaries) &&
    Array.isArray(data.books) &&
    Array.isArray(data.recentMoments) &&
    typeof data.provincesVisitedCount === 'number'
  )
}

/** 首页缓存声明（原生端沿用 OfflineBootstrap 写的 'home' 旧快照做兼容） */
export const HOME_CACHE_CONFIG: LocalFirstConfigBase<HomeData> = {
  key: '/api/home',
  ttlMs: HOME_TTL_MS,
  hardTtlMs: HOME_HARD_TTL_MS,
  schemaVersion: HOME_CACHE_SCHEMA_VERSION,
  legacyNativeKey: 'home',
  validate: isHomeData,
}

/** 网络取数（HTTP 缓存 no-cache：可以命中 ETag，但必须校验，避免拿到上次页面的旧首屏） */
function fetchHomeRemote(): Promise<HomeData> {
  return apiFetch<HomeData>(apiUrl('/api/home'), { cache: 'no-cache' })
}

/**
 * 首页交互壳（P1-18；E1 本地快照水合；P1 接入本地优先读取层）
 * ============================================================================
 * 数据来源优先级：
 *  ① 服务端直出 initialData（Web SSR，首帧 HTML 就是真实内容）；
 *  ② 本地缓存（原生 SQLite 快照 / Web IndexedDB + localStorage 同步镜像，由 local-first 统一编排）——
 *     移动静态壳没有服务端运行时，initialData 恒为 null，冷/热启动靠它**第一帧就出内容**；
 *  ③ 首次安装（没有任何本地快照）→ 沿用旧行为：骨架屏 + 客户端 /api/home。
 *
 * 校验机制（何时读本地/何时拉云端）：
 *  · 本地 fresh（< 5min）→ 直读本地，在线时后台静默校准（不转圈、不闪骨架）；
 *  · 本地 stale（< 24h）→ 直读本地 + 后台拉取，顶部只出现一个极轻的「更新中」chip；
 *  · 超过 24h / 无本地 / 校验失败 → 走网络（此时才显示骨架屏），失败再退回本地（标记离线）；
 *  · 用户下拉刷新 / 点「重试」→ force 走网络（保留原来的骨架屏语义：整页数据重排需要占位）。
 *
 * 读取一律放在 layout effect（水合提交后、浏览器绘制前），不能进 useState 初始化器：
 * 静态壳的首帧 HTML 是骨架，渲染期读缓存会与服务端 HTML 不一致（hydration mismatch）。
 */
export default function HomePageClient({ initialData }: { initialData: HomeData | null }) {
  const [data, setData] = useState<HomeData | null>(initialData)
  const [error, setError] = useState('')
  // 服务端已给数据时不再进入首屏 loading；否则沿用「先骨架、再取数」的旧行为
  // （本地缓存命中会在下面的 layout effect 里立刻把 loading 关掉）
  const [loading, setLoading] = useState(initialData === null)
  /** 后台校准中：只在顶部给一个极轻的提示，不挡内容、不出现滚动条式 spinner */
  const [revalidating, setRevalidating] = useState(false)
  const requestIdRef = useRef(0)
  /** 与 state 同步的最近数据：刷新失败时据此判断「要不要退回错误态」 */
  const dataRef = useRef<HomeData | null>(initialData)

  const applyData = useCallback((next: HomeData | null) => {
    dataRef.current = next
    setData(next)
  }, [])

  /**
   * 一轮本地优先取数。
   * @param force 跳过「刚拉过」的抑制（用户刷新 / 重试）
   * @param silent 后台校准：不切骨架屏、失败不清空内容
   */
  const load = useCallback(
    async (opts: { force?: boolean; silent?: boolean } = {}) => {
      // requestId 防竞态：连续两次刷新时只接受最后一次的结果
      const requestId = ++requestIdRef.current
      /**
       * 显式刷新（下拉刷新 / 点「重试」）沿用原来的骨架屏语义：整页数据重排必须有占位，
       * 且 HomeMobile 的票据/归档流程依赖「刷新会卸载首页」这个顺序（见 HomeMobile 注释）。
       * 后台校准（silent）已展示内容时才用顶部轻提示，绝不遮内容。
       */
      if (!opts.silent) setLoading(true)
      else if (dataRef.current != null) setRevalidating(true)
      try {
        const prepare = await localFirst({
          ...HOME_CACHE_CONFIG,
          fetchRemote: fetchHomeRemote,
          force: opts.force === true,
        })
        if (requestId !== requestIdRef.current) return

        // ① 命中本地且未超硬新鲜期：第一帧就有内容（不显示骨架屏）
        if (prepare.hit && prepare.hit.freshness !== 'expired') {
          applyData(prepare.hit.data)
          setError('')
          setLoading(false)
          if (prepare.hit.freshness === 'stale') setRevalidating(true)
        }

        // ② 后台 / 前台校准（离线、省流量、并发去重、401 清缓存都在 local-first 里处理）
        const result = await prepare.refresh
        if (requestId !== requestIdRef.current) return
        if (result.data) {
          applyData(result.data)
          setError('')
        } else if (result.error) {
          // 已有本地内容时不让一次网络失败把用户打回错误态（本地优先）
          setError(result.error)
        }
      } catch (e) {
        if (requestId !== requestIdRef.current) return
        if (dataRef.current == null) {
          setError(e instanceof Error ? e.message : '网络错误，请稍后重试')
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setRevalidating(false)
        }
      }
    },
    [applyData],
  )

  /**
   * 水合后、首次绘制前：同步读 localStorage 镜像（首帧就有内容）。
   * 只有「没有服务端数据」时才需要（移动静态壳 / 服务端取数失败降级）。
   */
  useIsomorphicLayoutEffect(() => {
    if (initialData !== null) return
    if (dataRef.current !== null) return
    const local = readLocalFirstSync(HOME_CACHE_CONFIG)
    if (!local || local.freshness === 'expired') return
    applyData(local.data)
    setError('')
    setLoading(false)
    if (local.freshness === 'stale') setRevalidating(true)
  }, [initialData, applyData])

  /**
   * 首屏取数 + 账号作用域校准。
   *  · initialData 存在 → 服务端已给内容：顺手落盘（下次冷启动/断网首屏用），不发请求；
   *  · 本地已顶上 → silent 校准（不闪骨架、失败不清空）；
   *  · 首次安装（无任何内容）→ 旧行为：骨架屏 + 取数。
   */
  useEffect(() => {
    scheduleLocalFirstScopeCheck()
    if (initialData !== null) {
      // 落盘走 local-first 的三层写入（IDB / SQLite + 同步镜像），异步、失败静默
      void createLocalFirstStore(HOME_CACHE_CONFIG).write(initialData)
      return
    }
    void load({ silent: dataRef.current !== null })
    // 只在挂载时判断一次：initialData 是服务端快照，不会中途变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切号 / 退出登录：立刻丢弃上一个账号的内容，再用新作用域重取
  useEffect(() => {
    return onLocalFirstScopeChange(() => {
      applyData(null)
      setError('')
      setRevalidating(false)
      void load({ force: true, silent: true })
    })
  }, [applyData, load])

  const reload = useCallback(async () => {
    await load({ force: true })
  }, [load])

  let content
  if (error && data == null) {
    content = (
      <>
        <div className="hidden md:block">
          <AsyncState variant="error" message={error} title="首页加载失败" actionLabel="重试" onAction={reload} />
        </div>
        <div className="md:hidden">
          <HomeMobileError message={error} onRetry={reload} />
        </div>
      </>
    )
  } else if (loading || !data) {
    // 骨架屏按断点自适配（HomeLoading 内部复刻真实版面）
    content = <HomeLoading />
  } else if (IS_MOBILE_SHELL) {
    // 移动静态壳：只挂移动树（桌面树连 chunk 都不加载；它是 CSS 隐藏的，本来就看不到）
    content = (
      <HomeMobile
        travelPosts={data.travelPosts as never[]}
        draftTravels={data.draftTravels}
        provincesVisitedCount={data.provincesVisitedCount}
        anniversaries={data.anniversaries as never[]}
        books={data.books}
        recentMoments={data.recentMoments}
        onRefresh={reload}
      />
    )
  } else {
    content = (
      <>
        <div className="hidden md:block">
          <HomeClient
            travelPosts={data.travelPosts as never[]}
            provincesVisitedCount={data.provincesVisitedCount}
            anniversaries={data.anniversaries as never[]}
            draftTravels={data.draftTravels}
            books={data.books}
            recentMoments={data.recentMoments}
            onRefresh={reload}
          />
        </div>
        <div className="md:hidden">
          <HomeMobile
            travelPosts={data.travelPosts as never[]}
            draftTravels={data.draftTravels}
            provincesVisitedCount={data.provincesVisitedCount}
            anniversaries={data.anniversaries as never[]}
            books={data.books}
            recentMoments={data.recentMoments}
            onRefresh={reload}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {revalidating && data != null ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center pt-[max(8px,env(safe-area-inset-top))]"
        >
          <span className="m-chip m-chip-sm">更新中…</span>
        </div>
      ) : null}
      {content}
    </>
  )
}
