'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/client/api'
import { apiUrl } from '@/lib/api-base'
import HomeClient from '@/components/HomeClient'
import HomeMobile from '@/components/HomeMobile'
import HomeLoading from '@/components/HomeLoading'
import AsyncState from '@/components/AsyncState'
import { HomeMobileError } from '@/components/HomeMobileStates'
import { readHomeSnapshot } from '@/lib/modules/offline/home-snapshot'
import type { HomeData } from '@/lib/home/home-data'

/**
 * 首页交互壳（P1-18）
 * ============================================================================
 * 服务端（app/page.tsx）先取好数据传进来，因此：
 *  · 首帧 HTML 就是真实内容（不是骨架屏），SSR/爬虫/无 JS 场景可用；
 *  · 桌面树与移动树**同时由服务端渲染**，用 CSS 断点（hidden md:block / md:hidden）
 *    决定显示哪棵，避免此前 useIsMobile 三态在服务端先出骨架、水合后整屏换树。
 *
 * 数据/错误/刷新语义与旧实现保持一致：
 *  · 服务端取数失败（initialData=null）→ 回退到客户端 fetch /api/home（旧路径）；
 *  · 刷新（HomeClient 的刷新按钮 / HomeMobile 的下拉刷新）→ 展示骨架屏后再落新数据
 *    （骨架屏不能删：刷新时整页数据重排，没有占位会二次跳变）；
 *  · 失败 → 桌面 AsyncState / 移动 HomeMobileError，均带「重试」。
 */
export default function HomePageClient({ initialData }: { initialData: HomeData | null }) {
  const [data, setData] = useState<HomeData | null>(initialData)
  const [error, setError] = useState('')
  // 服务端已给数据时不再进入首屏 loading；否则沿用「先骨架、再取数」的旧行为
  const [loading, setLoading] = useState(initialData === null)
  const requestIdRef = useRef(0)
  /** 与 state 同步的最近数据：刷新失败时据此判断"要不要接受快照兜底" */
  const dataRef = useRef<HomeData | null>(initialData)

  const load = useCallback(async ({ bypassCache }: { bypassCache: boolean }) => {
    // requestId 防竞态：连续两次刷新时只接受最后一次的结果
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const next = await apiFetch<HomeData>(apiUrl('/api/home'), {
        bypassMemoryCache: bypassCache,
        cache: bypassCache ? 'no-store' : 'default',
      })
      if (requestId !== requestIdRef.current) return
      dataRef.current = next
      setData(next)
      setError('')
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

  // 服务端取数失败时回退客户端取数（与旧首页行为一致）
  useEffect(() => {
    if (initialData === null) void load({ bypassCache: false })
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
