'use client'

import { useEffect, useState } from 'react'
import { resolveMediaUrlsByRemote } from '@/lib/modules/offline/media'

/**
 * 媒体 URL 本地化 hook：输入远端 URL 列表，输出「远端 URL → 本地 URI」映射。
 * 原生端命中本地缓存时返回本地 URI，否则保持远端 URL；Web 端恒为空映射。
 */
export function useLocalMediaUrls(urls: (string | null | undefined)[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const uniq = Array.from(new Set(urls.filter(Boolean) as string[]))
    if (uniq.length === 0) return
    let alive = true
    resolveMediaUrlsByRemote(uniq).then((m) => {
      if (alive) setMap(m)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join('|')])

  return map
}

/** 便捷：单个 URL 的本地化结果 */
export function useLocalMediaUrl(url: string | null | undefined): string {
  const map = useLocalMediaUrls([url])
  return url ? (map[url] ?? url) : ''
}
