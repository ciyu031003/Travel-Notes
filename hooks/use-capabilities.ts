'use client'

import { useEffect, useState } from 'react'
import type { UserCapabilities } from '@/lib/modules/space/permissions'

let cached: UserCapabilities | null = null

/**
 * 读取当前用户能力（3.6 后台能力模块化）：供各模块管理入口显隐。
 * 模块内全局缓存一份，避免重复请求。
 */
export function useCapabilities(): UserCapabilities | null {
  const [caps, setCaps] = useState<UserCapabilities | null>(cached)

  useEffect(() => {
    if (cached) return
    fetch('/api/me/capabilities')
      .then((r) => r.json())
      .then((j) => {
        const next = j?.data?.capabilities
        if (next) {
          cached = next as UserCapabilities
          setCaps(cached)
        }
      })
      .catch(() => {})
  }, [])

  return caps
}
