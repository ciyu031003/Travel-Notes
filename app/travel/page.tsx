'use client'

import TravelClient from './TravelClient'
import TravelMobileClient, { TravelMobileLoading } from './TravelMobileClient'
import AsyncState from '@/components/AsyncState'
import { DesktopOnly, MobileOnly } from '@/components/mobile/MobileOnly'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useTravelList } from '@/hooks/use-travel-list'

export default function TravelPage() {
  /**
   * 移动 / 桌面只渲染一支（2026-10-24）。
   *
   * 此前用 `hidden md:block` 双向渲染：两棵树都挂载，手机上隐藏的桌面
   * TravelClient 照样 dynamicImport 下 d3-geo 地图大 chunk、多发一次
   * /api/travel/settings 请求 —— tab 切换可感知变慢（移动端性能税）。
   * 取数/合并/离线判定已下沉到 useTravelList（P-13 共享数据层）。
   */
  const isMobile = useIsMobile()
  const { posts, error, offline, reload } = useTravelList()

  if (error) {
    if (isMobile === true) return <TravelMobileLoading message={error} />
    return <AsyncState variant="error" message={error} title="旅行记录加载失败" />
  }
  if (!posts || isMobile === null) {
    return <AsyncState variant="loading" message="正在加载旅行记录…" />
  }
  return (
    <>
      <MobileOnly>
        <TravelMobileClient posts={posts as never[]} offline={offline} onRefresh={reload} />
      </MobileOnly>
      <DesktopOnly>
        <TravelClient posts={posts as never[]} offline={offline} />
      </DesktopOnly>
    </>
  )
}
