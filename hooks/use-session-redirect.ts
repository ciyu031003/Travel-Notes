'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isSessionExpiredError } from '@/lib/client/api'

/**
 * 会话失效引导（受保护页面共用）。
 *
 * 背景：中间件对受保护**接口**返回 `307 → /login?redirect=…`（不是 401）。
 * 消费方若直接 `fetch()` 会跟随重定向拿到登录页 HTML，`res.ok === true` 且 JSON 解析失败
 * → 既不报错也没有数据 → 页面条件（`loading || !id`）恒真 → **永远停在「加载中」**
 * （真机上复现：未登录点「我的」一直转圈，登录后才显示）。
 *
 * 现在 `apiFetch` 已把「被重定向」归一成 401 `ApiError`（见 lib/client/api.ts），
 * 本 Hook 负责把这类错误翻译成「去登录页」，让页面不再自己猜。
 *
 * @param error useApi / apiFetch 返回的错误文案
 * @returns 是否处于「会话失效、正在跳转」状态（调用方可据此渲染过渡态）
 */
export function useSessionRedirect(error: string): boolean {
  const router = useRouter()
  const pathname = usePathname()
  const expired = isSessionExpiredError(error)

  useEffect(() => {
    if (!expired) return
    const redirect = encodeURIComponent(pathname || '/')
    router.replace(`/login?redirect=${redirect}`)
  }, [expired, router, pathname])

  return expired
}
