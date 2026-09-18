'use client'

import { useEffect, useState } from 'react'
import UserProfile from '@/components/social/UserProfile'

/**
 * 移动端本地壳可静态导出的「用户主页」入口（`/circle/user/[id]` 的查询参数版）。
 *
 * 两个约束决定了它的路径是 `/circle/user-detail` 而不是 `/circle/user/detail`：
 *  ① 静态导出只为 `generateStaticParams` 声明的路径产出文件（这里是 `/circle/user/0`），
 *     所以点别人头像去 `/circle/user/123` 在本地壳里取不到资源 → 回落到首页
 *     （与 `app/circle/detail/page.tsx` 同一个原因）；
 *  ② `/circle/user` 已经是一个动态段（`[id]`），在它下面再放 `detail` 会被当成
 *     `id="detail"` 的**动态路由**、而不是静态路由 —— 导出时不会生成 `user/detail.html`。
 *     因此把查询参数版放在同级目录，路径互不冲突。
 */
export default function CircleUserQueryPage() {
  const [userId, setUserId] = useState<number>(0)

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('id')
    const n = Number(raw)
    setUserId(Number.isFinite(n) && n > 0 ? n : 0)
  }, [])

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--social-bg)] px-6 text-center text-sm text-[var(--social-muted)]">
        正在打开这位旅行者的主页…
      </div>
    )
  }

  return <UserProfile userId={userId} />
}
