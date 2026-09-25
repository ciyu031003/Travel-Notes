'use client'

import { apiUrl } from '@/lib/api-base'
import { hapticLight } from '@/lib/mobile/haptics'

/**
 * 「新建旅行」的统一入口动作。
 *
 * 为什么抽出来：此前这段逻辑只写在 `MobileBottomNav` 的 FAB 里，
 * 于是"新建旅行"只有那一个入口 —— 而真机反馈「找不到新建旅行在哪个地方」。
 * 现在列表页头部的「＋ 新建旅行」按钮与 Dock FAB 共用同一份逻辑，
 * 不会再出现"两个入口行为不一致"（其中一个忘了判登录）。
 *
 * 游客可浏览公开内容，但记录旅行需先登录（M0 产品规则）：
 * 静态壳里没有 middleware 兜底，所以这里必须自己判一次。
 */
export async function openNewTravel(router: { push: (href: string) => void }): Promise<void> {
  void hapticLight()
  try {
    const res = await fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
    const data = await res.json().catch(() => null)
    if (data && data.authenticated) {
      router.push('/travel/new')
    } else {
      router.push('/login?redirect=' + encodeURIComponent('/travel/new'))
    }
  } catch {
    router.push('/login?redirect=' + encodeURIComponent('/travel/new'))
  }
}
