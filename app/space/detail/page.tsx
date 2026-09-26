'use client'

import { useEffect, useState } from 'react'
import SpaceDetailClient from '@/components/space/SpaceDetailClient'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { LoaderBlock } from '@/components/mobile/Loader'

/**
 * 空间详情的**查询参数**入口（`/space/detail?slug=...`）—— 移动端本地壳专用。
 *
 * 为什么需要它：Capacitor 壳是 `output: 'export'` 静态站点，只为
 * `generateStaticParams` 声明的参数产出 HTML；而空间 slug 是每个用户自己的数据，
 * 构建期无法枚举。若用户落到 `/space/<真实slug>`，静态站里没有这个文件，
 * WebView 取不到页面（真机表现就是"点进去没反应/跳回首页"）。
 * 与 `/travel/detail?slug=` 同一套办法：静态页 + 从 query 读 slug。
 *
 * Web 端仍走 `/space/[slug]`（服务端渲染），两边都由 SpaceDetailClient 取数。
 */
export default function SpaceDetailQueryPage() {
  const [slug, setSlug] = useState('')

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('slug')
    if (s) setSlug(s)
  }, [])

  if (!slug) {
    return (
      <div className="m-gutter pt-2">
        <LargeTitle title="空间" back="/space" />
        <LoaderBlock label="正在打开空间…" />
      </div>
    )
  }

  return <SpaceDetailClient slugProp={slug} />
}
