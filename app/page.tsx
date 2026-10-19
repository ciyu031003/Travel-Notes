import type { HomeData } from '@/lib/home/home-data'
import HomePageClient from '@/components/HomePageClient'

/**
 * 首页：服务端取数 → 首帧 HTML 直接含真实内容（Web）；移动端静态壳不含服务端运行时。
 *
 * 两种构建形态：
 * - Web（MOBILE_EXPORT 未设）：读 httpOnly 会话 Cookie 后按请求渲染（cookies() 使其动态），
 *   内容随登录态变化，不能公共缓存。
 * - 移动静态导出（MOBILE_EXPORT=1）：output:'export' **没有运行时**，
 *   且 force-dynamic 页面在导出模式会直接构建失败。因此壳内首帧不取数，
 *   交给 HomePageClient 在客户端请求 /api/home（离线快照兜底也在客户端）。
 *
 * 注意：这里不再显式声明 `dynamic = 'force-dynamic'`。Web 构建中 cookies() 会自动让路由
 * 变为动态渲染；而导出构建走上面的静态分支，不会读取 cookies。
 */
const IS_MOBILE_EXPORT = process.env.MOBILE_EXPORT === '1'

export default async function HomePage() {
  if (IS_MOBILE_EXPORT) {
    return <HomePageClient initialData={null} />
  }

  // 动态 import：避免静态导出把 next/headers / prisma 服务端链路打进壳
  const [{ getCurrentUserId }, { getHomeData }] = await Promise.all([
    import('@/lib/current-user'),
    import('@/lib/home/home-data'),
  ])

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
