'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'

/**
 * Giscus 评论组件
 * 通过 GitHub Discussions 提供零后端评论。
 * 需在 .env / .env.local 中配置（未配置时组件不渲染）：
 *   NEXT_PUBLIC_GISCUS_REPO="owner/repo"
 *   NEXT_PUBLIC_GISCUS_REPO_ID="..."
 *   NEXT_PUBLIC_GISCUS_CATEGORY="Announcements"
 *   NEXT_PUBLIC_GISCUS_CATEGORY_ID="..."
 *   NEXT_PUBLIC_GISCUS_MAPPING="pathname"   // 可选: pathname|url|title|og:title
 *   NEXT_PUBLIC_GISCUS_THEME="preferred_color_scheme" // 可选
 */
export default function CommentsSection({ term }: { term?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [configured] = useState(() => {
    return (
      typeof process !== 'undefined' &&
      !!process.env.NEXT_PUBLIC_GISCUS_REPO &&
      !!process.env.NEXT_PUBLIC_GISCUS_REPO_ID
    )
  })

  useEffect(() => {
    if (!configured || !ref.current) return
    const container = ref.current
    container.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://giscus.app/client.js'
    script.async = true
    script.crossOrigin = 'anonymous'

    const repo = process.env.NEXT_PUBLIC_GISCUS_REPO || ''
    script.setAttribute('data-repo', repo)
    script.setAttribute('data-repo-id', process.env.NEXT_PUBLIC_GISCUS_REPO_ID || '')
    script.setAttribute('data-category', process.env.NEXT_PUBLIC_GISCUS_CATEGORY || 'Announcements')
    script.setAttribute('data-category-id', process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID || '')
    script.setAttribute('data-mapping', process.env.NEXT_PUBLIC_GISCUS_MAPPING || 'pathname')
    script.setAttribute('data-strict', '0')
    script.setAttribute('data-reactions-enabled', '1')
    script.setAttribute('data-emit-metadata', '0')
    script.setAttribute('data-input-position', 'top')
    script.setAttribute('data-theme', process.env.NEXT_PUBLIC_GISCUS_THEME || 'preferred_color_scheme')
    script.setAttribute('data-lang', 'zh-CN')
    if (term) script.setAttribute('data-term', term)
    script.setAttribute('data-loading', 'lazy')

    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [configured, term])

  if (!configured) return null

  return (
    <section className="mt-10 border-t border-gray-200 dark:border-gray-800 pt-8">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        <MessageSquare className="w-5 h-5 text-primary-500" />
        评论
      </h2>
      <div ref={ref} className="giscus" />
    </section>
  )
}
