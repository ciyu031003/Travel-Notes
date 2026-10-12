'use client'

import { Skeleton } from '@/components/mobile/Skeleton'
import { HomeMobileLoading } from '@/components/HomeMobileStates'
import { useIsMobile } from '@/hooks/use-is-mobile'

/**
 * 首页加载骨架（P1-5）
 *
 * 此前首页加载态是**居中转圈 + 一行文字**（AsyncState variant="loading"），
 * 随后整页跳变成版面完全不同的内容 —— CLS 与"感知慢"双输；而项目其实早有
 * 完整的 Skeleton 体系（components/mobile/Skeleton，注释明确写着"防 CLS 占位"），
 * 时间线等页面也已正确使用。
 *
 * 这里给桌面端补一个**复刻真实版面**的骨架：同行列、同高度、同节奏，
 * 让内容落位时几乎无位移。移动端复用已有的 HomeMobileLoading。
 */
function HomeDesktopLoading() {
  return (
    <div className="min-h-dvh bg-travel-cream dark:bg-shell-bg">
      {/* Hero：左文右图两列，与 HomeClient 的 md:grid-cols-[1.02fr_0.98fr] 对齐 */}
      <section className="container-page grid items-center gap-8 pt-16 md:grid-cols-[1.02fr_0.98fr] md:gap-12 lg:gap-16 lg:pt-24">
        <div className="text-center md:text-left">
          <Skeleton className="mx-auto h-4 w-40 md:mx-0" />
          <div className="mt-6 space-y-4">
            <Skeleton className="mx-auto h-12 w-[85%] md:mx-0" />
            <Skeleton className="mx-auto h-12 w-[65%] md:mx-0" />
          </div>
          <div className="mt-6 space-y-2.5">
            <Skeleton className="mx-auto h-3.5 w-[90%] md:mx-0" />
            <Skeleton className="mx-auto h-3.5 w-[70%] md:mx-0" />
          </div>
          <div className="mt-8 flex justify-center gap-3 md:justify-start">
            <Skeleton className="h-12 w-40 rounded-full" />
            <Skeleton className="h-12 w-28 rounded-full" />
          </div>
        </div>
        {/* 地图容器：与真实 hero 的 h-[260px]/md:h-[440px]/lg:h-[470px] 一致 */}
        <Skeleton className="h-[260px] w-full rounded-2xl md:h-[440px] lg:h-[470px]" />
      </section>

      {/* 统计条 */}
      <section className="container-page mt-14">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-travel-line/60 p-5 dark:border-shell-line">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-3 h-3.5 w-24" />
            </div>
          ))}
        </div>
      </section>

      {/* 最近旅行卡片流 */}
      <section className="container-page mt-14 pb-16">
        <Skeleton className="h-6 w-32" />
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-travel-line/60 dark:border-shell-line">
              <Skeleton className="h-48 w-full" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * 首页加载态唯一入口：按断点给对应骨架。
 * isMobile 为 null（SSR/首帧）时给桌面骨架 —— 与 useIsMobile 的既有约定一致
 * （服务端不提前挂载移动树），且两者形状同源，切换时不会二次跳变。
 */
export function HomeLoading() {
  const isMobile = useIsMobile()
  return isMobile === true ? <HomeMobileLoading /> : <HomeDesktopLoading />
}

export { HomeDesktopLoading }
export default HomeLoading
