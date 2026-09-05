'use client'

import { useEffect, useState } from 'react'
import TravelDetailShell from '../[slug]/TravelDetailShell'

/**
 * 移动端本地壳可静态导出的旅行详情入口。
 * Web 端仍走 /travel/[slug]（SSR），本地壳使用 /travel/detail?slug=...。
 */
export default function TravelDetailQueryPage() {
  const [slug, setSlug] = useState('')

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('slug')
    if (s) setSlug(s)
  }, [])

  return <TravelDetailShell slugProp={slug} />
}
