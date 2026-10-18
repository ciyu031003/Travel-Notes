import { getCurrentUserId } from '@/lib/current-user'
import { getHomeData, type HomeData } from '@/lib/home/home-data'
import HomePageClient from '@/components/HomePageClient'

/**
 * 首页（P1-18）：服务端取数 → 首帧 HTML 直接含真实内容。
 *
 * 为什么要 force-dynamic：getCurrentUserId() 读 httpOnly 会话 Cookie，首页内容与
 * 登录态相关（用户私有数据不能进公共缓存），因此这里按请求渲染、不做静态预渲染。
 * 代价是构建期不再产出 .next/server/app/index.html（旧版是纯客户端静态壳），
 * 但换来的是请求首包即含内容 —— 这正是 P-1 要解决的"服务端 HTML 无内容"。
 *
 * 取数失败（如数据库不可用）时**不白屏**：交给客户端壳回退到 /api/home 的旧路径，
 * 由 error.tsx / 首页错误态兜底，不把 DB 依赖硬编码放行（见布局级 error.tsx）。
 */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let initialData: HomeData | null = null
  try {
    const userId = await getCurrentUserId()
    initialData = await getHomeData(userId)
  } catch (e) {
    // 服务端取数失败时降级：记录真实原因，客户端壳会再试一次 /api/home
    console.error('[home] 服务端取数失败，回退客户端取数:', e)
  }
  return <HomePageClient initialData={initialData} />
}
