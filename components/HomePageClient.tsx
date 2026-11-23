'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamicImport from 'next/dynamic'
import { apiFetch } from '@/lib/client/api'
import { apiUrl } from '@/lib/api-base'
import HomeMobile from '@/components/HomeMobile'
import HomeLoading from '@/components/HomeLoading'
import AsyncState from '@/components/AsyncState'
import { HomeMobileError } from '@/components/HomeMobileStates'
import { readHomeSnapshot } from '@/lib/modules/offline/home-snapshot'
import { persistSoon, readPersistedCache, useIsomorphicLayoutEffect } from '@/lib/client/persisted-cache'
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

/** 首页持久化快照 key（沿用接口 path，与 useApi / 其它钩子的约定一致） */
const HOME_CACHE_KEY = '/api/home'
/** 首页快照新鲜期：24h。首屏只要「有内容可画」，真正的对齐交给后台 revalidate */
const HOME_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * 首页交互壳（P1-18；E1 加入本地优先水合）
 * ============================================================================
 * 数据来源有三个，优先级从高到低：
 *  ① 服务端直出 initialData（Web SSR，首帧 HTML 就是真实内容）；
 *  ② localStorage 快照（E1 —— 移动静态壳 MOBILE_EXPORT 没有服务端运行时，
 *     initialData 恒为 null；冷/热启动时先读上次的快照，**挂载第一帧就有内容**，
 *     不用再等 /api/home 一个往返才从骨架屏换成内容）；
 *  ③ 首次安装（没有任何本地快照）→ 沿用旧行为：骨架屏 + 客户端 /api/home。
 *
 * 为什么读取放在 layout effect 里而不是 useState 初始化器：
 * 服务端/静态导出的首帧 HTML 只有骨架，若渲染期直接读 localStorage 会读到数据，
 * 首帧结构就与 HTML 不一致（hydration mismatch）。layout effect 在「水合提交后、
 * 浏览器绘制前」执行，setState 会同步重渲染 —— 用户看不到「骨架闪一下再变内容」。
 *
 * 数据/错误/刷新语义与旧实现保持一致：
 *  · 刷新（HomeClient 的刷新按钮 / HomeMobile 的下拉刷新）→ 仍先展示骨架屏再落新数据
 *    （骨架屏不能删：刷新时整页数据重排，没有占位会二次跳变）；
 *  · 失败 → 桌面 AsyncState / 移动 HomeMobileError，均带「重试」；
 *    但**已有本地内容时**不让一次网络失败把用户打回错误态（本地优先）。
 */
export default function HomePageClient({ initialData }: { initialData: HomeData | null }) {
  const [data, setData] = useState<HomeData | null>(initialData)
  const [error, setError] = useState('')
  // 服务端已给数据时不再进入首屏 loading；否则沿用「先骨架、再取数」的旧行为
  // （本地快照命中会在下面的 layout effect 里立刻把 loading 关掉）
  const [loading, setLoading] = useState(initialData === null)
  const requestIdRef = useRef(0)
  /** 与 state 同步的最近数据：刷新失败时据此判断"要不要接受快照兜底" */
  const dataRef = useRef<HomeData | null>(initialData)

  const load = useCallback(async ({ bypassCache, silent = false }: { bypassCache: boolean; silent?: boolean }) => {
    // requestId 防竞态：连续两次刷新时只接受最后一次的结果
    const requestId = ++requestIdRef.current
    // silent = 后台校准：已有本地快照在显示，不切骨架屏、失败也不打断用户
    if (!silent) setLoading(true)
    try {
      const next = await apiFetch<HomeData>(apiUrl('/api/home'), {
        bypassMemoryCache: bypassCache,
        cache: bypassCache ? 'no-store' : 'default',
      })
      if (requestId !== requestIdRef.current) return
      dataRef.current = next
      setData(next)
      setError('')
      // 落盘推迟到下一帧之后：首页快照含旅行/画册/碎碎念摘要，序列化不该卡在渲染帧上
      persistSoon(HOME_CACHE_KEY, next)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      /**
       * P2-29（D 交接）：离线兜底。原生壳里 OfflineBootstrap 每次启动会把最近一次
       * /api/home 响应落 SQLite；网络失败时用这份快照顶上，首页不再直接进错误态。
       * Web 端 readHomeSnapshot() 恒返回 null → 行为与之前完全一致。
       */
      const snapshot = await readHomeSnapshot<HomeData>()
      if (requestId !== requestIdRef.current) return
      if (snapshot?.data) {
        if (!dataRef.current) {
          dataRef.current = snapshot.data
          setData(snapshot.data)
        }
        setError('')
      } else if (!dataRef.current) {
        setError(e instanceof Error ? e.message : '网络错误，请稍后重试')
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  /**
   * 水合后、首次绘制前：同步读 localStorage 快照。
   * 只有「没有服务端数据」时才需要（移动静态壳 / 服务端取数失败降级）。
   */
  useIsomorphicLayoutEffect(() => {
    if (initialData !== null) return
    if (dataRef.current !== null) return
    const hit = readPersistedCache<HomeData>(HOME_CACHE_KEY, { ttlMs: HOME_SNAPSHOT_TTL_MS })
    if (!hit?.value) return
    dataRef.current = hit.value
    setData(hit.value)
    setError('')
    setLoading(false)
  }, [initialData])

  // 服务端已经取好数据时，顺手把它落盘：下次冷启动（含 Web 刷新）就能先本地出内容
  useEffect(() => {
    if (initialData !== null) persistSoon(HOME_CACHE_KEY, initialData)
  }, [initialData])

  /**
   * 首屏取数：
   *  · initialData 存在 → 服务端已给内容，这里不打扰（刷新走 reload）；
   *  · 本地快照已经顶上 → silent 校准（不闪骨架、失败不清空）；
   *  · 首次安装（无任何内容）→ 旧行为：骨架屏 + 取数。
   */
  useEffect(() => {
    if (initialData !== null) return
    void load({ bypassCache: false, silent: dataRef.current !== null })
    // 只在挂载时判断一次：initialData 是服务端快照，不会中途变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reload = useCallback(async () => {
    await load({ bypassCache: true })
  }, [load])

  if (error) {
    return (
      <>
        <div className="hidden md:block">
          <AsyncState variant="error" message={error} title="首页加载失败" actionLabel="重试" onAction={reload} />
        </div>
        <div className="md:hidden">
          <HomeMobileError message={error} onRetry={reload} />
        </div>
      </>
    )
  }

  if (loading || !data) {
    // 骨架屏按断点自适配（HomeLoading 内部复刻真实版面）
    return <HomeLoading />
  }

  // 移动静态壳：只挂移动树（桌面树连 chunk 都不加载；它是 CSS 隐藏的，本来就看不到）
  if (IS_MOBILE_SHELL) {
    return (
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
  }

  return (
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
