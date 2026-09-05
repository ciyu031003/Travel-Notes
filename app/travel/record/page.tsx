'use client'

import { useEffect, useState } from 'react'
import TravelRecordPage from '../[slug]/record/TravelRecordPage'

/**
 * 移动端本地壳可静态导出的“记录今日”入口。
 * Web 端仍走 /travel/[slug]/record，本地壳使用 /travel/record?slug=...。
 */
export default function TravelRecordQueryPage() {
  const [slug, setSlug] = useState('')

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('slug')
    if (s) setSlug(s)
  }, [])

  return <TravelRecordPage slugProp={slug} />
}
