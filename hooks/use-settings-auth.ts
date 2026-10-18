'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 后台设置页鉴权（P2-32）。
 *
 * 行为与拆分前 app/admin/settings/page.tsx 内联的 checkAuth 完全一致：
 * GET /api/admin/check；非 2xx / authenticated=false / 网络异常 → 跳 /admin/login；
 * 通过后 loading=false 才渲染页面。
 */
export function useSettingsAuth(): { loading: boolean } {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/check')
        if (!res.ok) {
          router.push('/admin/login')
          return
        }
        const data: unknown = await res.json()
        if (!alive) return
        const authenticated =
          typeof data === 'object' && data !== null && (data as { authenticated?: unknown }).authenticated === true
        if (authenticated) {
          setLoading(false)
        } else {
          router.push('/admin/login')
        }
      } catch {
        router.push('/admin/login')
      }
    }

    void checkAuth()
    return () => {
      alive = false
    }
  }, [router])

  return { loading }
}
