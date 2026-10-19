'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { apiUrl } from '@/lib/api-base'
import { isAdminGuardExemptPath, resolveAdminGuard } from '@/lib/services/admin-access'

/**
 * 后台外壳。
 *
 * B11：除了原有的「登录态 + 首登改密」检查，再加一道**页面级能力守卫** ——
 * 拉 /api/me/capabilities，明确没有 canManageContent 的用户直接送去 /me，
 * 不再让他们进后台看一堆点了就 403 的菜单。
 *
 * 注意：这只是体验层收敛，安全边界仍在服务端（每个写接口都有 requireCapability / 归属校验）。
 * 能力接口失败（网络抖动/5xx）时不踢人，避免管理员被临时故障锁在门外。
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isAdminGuardExemptPath(pathname)) {
      return
    }

    let cancelled = false

    const checkStatus = async () => {
      // 登录态与能力并行拉取；能力接口失败不阻断登录态判断
      const [checkRes, capsRes] = await Promise.allSettled([
        fetch('/api/admin/check'),
        fetch(apiUrl('/api/me/capabilities')),
      ])
      if (cancelled) return

      // 登录态：请求失败或非 2xx 一律按未登录处理（与原实现一致，避免半开壳）
      if (checkRes.status !== 'fulfilled' || !checkRes.value.ok) {
        router.push('/admin/login')
        return
      }

      let authenticated = false
      let requirePasswordChange = false
      try {
        const data = await checkRes.value.json()
        authenticated = Boolean(data?.authenticated)
        requirePasswordChange = Boolean(data?.requirePasswordChange)
      } catch {
        router.push('/admin/login')
        return
      }

      // 能力：只有明确取到 200 才给出 true/false，其它情况交给 null（不因接口故障踢人）
      let canManageContent: boolean | null = null
      if (capsRes.status === 'fulfilled' && capsRes.value.ok) {
        try {
          const capData = await capsRes.value.json()
          const caps = capData?.data?.capabilities
          if (caps && typeof caps.canManageContent === 'boolean') {
            canManageContent = caps.canManageContent
          }
        } catch {
          canManageContent = null
        }
      }

      if (cancelled) return
      const decision = resolveAdminGuard(pathname, { authenticated, requirePasswordChange, canManageContent })
      // 同路径不重复 push，避免循环跳转
      if (decision.redirect && decision.redirect !== pathname) {
        router.push(decision.redirect)
      }
    }

    checkStatus().catch(() => {
      if (!cancelled) router.push('/admin/login')
    })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return <>{children}</>
}
