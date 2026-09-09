'use client'

import HomeClient from '@/components/HomeClient'
import HomeMobile, { HomeMobileError, HomeMobileLoading } from '@/components/HomeMobile'
import AsyncState from '@/components/AsyncState'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'

interface HomeData {
  travelPosts: unknown[]
  anniversaries: unknown[]
  provincesVisitedCount: number
}

export default function HomePage() {
  // 阶段 A · A2：统一取数层（去重/取消/统一错误），服务端 Cache-Control 兜底浏览器缓存
  const { data, error, loading, reload } = useApi<HomeData>(apiUrl('/api/home'))

  if (error) {
    return (
      <>
        <div className="hidden md:block">
          <AsyncState variant="error" message={error} title="首页加载失败" />
        </div>
        <div className="md:hidden">
          <HomeMobileError message={error} onRetry={reload} />
        </div>
      </>
    )
  }
  if (loading || !data) {
    return (
      <>
        <div className="hidden md:block">
          <AsyncState variant="loading" message="正在翻开你的旅行记忆…" />
        </div>
        <div className="md:hidden">
          <HomeMobileLoading />
        </div>
      </>
    )
  }
  return (
    <>
      <div className="hidden md:block">
        <HomeClient
          travelPosts={data.travelPosts as never[]}
          provincesVisitedCount={data.provincesVisitedCount}
          anniversaries={data.anniversaries as never[]}
        />
      </div>
      <div className="md:hidden">
        <HomeMobile
          travelPosts={data.travelPosts as never[]}
          provincesVisitedCount={data.provincesVisitedCount}
          anniversaries={data.anniversaries as never[]}
          onRefresh={reload}
        />
      </div>
    </>
  )
}
