'use client'

import { useEffect, useState } from 'react'
import PostDetail from '@/components/social/PostDetail'

/**
 * 移动端本地壳可静态导出的「旅行故事详情」入口。
 *
 * 为什么必须有这个页面（真机反馈"旅行圈点击用户公开的以后，直接跳转到了首页，没办法直接阅览"）：
 * 本地壳是 `output: 'export'` 的静态站点，动态段 `/circle/[postId]` **只会导出
 * 由 `generateStaticParams` 声明的那些路径** —— 目前只有 `/circle/0`。
 * 于是点任意一张卡片都会去请求 `/circle/123`，静态站没有这个文件，
 * WebView 拿不到资源 → 表现为"跳回首页"。
 *
 * 这与 `/travel/[slug]` 早先踩过的坑是同一类，那边的解法就是本文件要复刻的：
 * 在本地壳里改用**查询参数**路由 `/circle/detail?postId=...`（静态可导出）。
 * Web 端仍走 `/circle/[postId]`（真实 SSR 路由，无此问题）。
 */
export default function CirclePostQueryPage() {
  const [postId, setPostId] = useState<number>(0)

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('postId')
    const n = Number(raw)
    setPostId(Number.isFinite(n) && n > 0 ? n : 0)
  }, [])

  if (!postId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--social-bg)] px-6 text-center text-sm text-[var(--social-muted)]">
        正在打开这篇旅行故事…
      </div>
    )
  }

  return <PostDetail postId={postId} />
}
