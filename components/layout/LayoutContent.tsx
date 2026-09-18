'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import MobileBottomNav from '@/components/layout/MobileBottomNav'
import { MobilePageTransition } from '@/components/mobile/MobilePageTransition'
import { cn } from '@/lib/utils'

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isTravelPage = pathname.startsWith('/travel')
  const isHomePage = pathname === '/'
  const isLoginPage = pathname === '/login'
  const isAlbumPage = pathname.startsWith('/album')
  const isCirclePage = pathname.startsWith('/circle')
  const isMePage = pathname.startsWith('/me')
  const isSyncPage = pathname.startsWith('/sync')
  const isAdminPage = pathname.startsWith('/admin')
  const isForgotPasswordPage = pathname.startsWith('/forgot-password')

  /**
   * 这些页面是"沉浸式全屏流"，**自带返回/关闭**，因此不挂底部 tab：
   *  · 登录 / 忘记密码：本来就不该有 tab
   *  · 画册阅读：全屏翻页，有自己的返回
   *
   * 注意 `/admin` **不再**在此列。原先它被一起排除，导致从「我的 → 账号设置 / 管理后台」
   * 进去后底部导航栏直接消失，用户在移动端没有任何退路（真机反馈"返回到首页以后，
   * 下方的 tab 栏直接没了"）。现在后台在移动端也挂底部导航，至少保证"能出去"。
   */
  if (isLoginPage || isForgotPasswordPage || isAlbumPage) {
    return <>{children}</>
  }

  // /travel 走标准壳：桌面端统一 Navbar + Footer，移动端走底部导航。
  if (isTravelPage) {
    return (
      <MobilePageTransition>
        <>
          <div className="hidden md:block">
            <Navbar />
          </div>
          <main id="main-content" className="flex-1 pt-0 md:pt-16">
            {children}
          </main>
          <div className="hidden md:block">
            <Footer />
          </div>
          <MobileBottomNav />
        </>
      </MobilePageTransition>
    )
  }

  // 四个主导航 Tab：移动端各自携带页面级 header / hero，底部统一走 MobileBottomNav。
  // 桌面端壳层不受影响。
  if (isHomePage) {
    return (
      <MobilePageTransition>
        <>
          <div className="hidden md:block">
            <Navbar />
          </div>
          <main id="main-content" className="flex-1 pt-0 md:pt-16">
            {children}
          </main>
          <MobileBottomNav />
        </>
      </MobilePageTransition>
    )
  }

  if (isCirclePage || isMePage || isSyncPage || isAdminPage) {
    return (
      <MobilePageTransition>
        <>
          {children}
          <MobileBottomNav />
        </>
      </MobilePageTransition>
    )
  }

  // 次级页面（时间线 / 碎碎念 / 搜索等）：移动端仍保留全局导航用于返回与设置，
  // 但页脚仅在桌面展示，移动端不显示 Web 版页脚。
  return (
    <MobilePageTransition>
      <>
        <div className="hidden md:block">
          <Navbar />
        </div>
        {/*
          移动端**不再渲染桌面 Navbar**：它没有返回键、和移动端的设计语言也不一致，
          用户反馈的「设置了子页却回不去」就是它造成的（页面自己的返回键多半是 `hidden md:flex`）。
          现在移动端靠两层保障：页面内的 LargeTitle 返回键 + 底部 tab。
        */}
        <main id="main-content" className="flex-1 pt-0 md:pt-20 md:pb-12">
          {children}
        </main>
        <div className="hidden md:block">
          <Footer />
        </div>
        <MobileBottomNav />
      </>
    </MobilePageTransition>
  )
}

