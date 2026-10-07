'use client'

import { useEffect } from 'react'

/**
 * mermaid 图表渲染器（挂载后扫描正文中的 ```mermaid 代码块并渲染）。
 *
 * ⚠️ 两条约束共同保证「没有图表的页面完全不付 mermaid 的体积」（1.21.0）：
 *  1. **动态 import** —— 静态引入会把数百 KB 的依赖打进所有引用它的首屏包
 *     （公开的旅行详情页 TravelDetailShell 就是其中之一），而绝大多数文章
 *     根本没有 mermaid 图。
 *  2. **先查再载** —— 仅当 DOM 里真的存在 `pre code.language-mermaid` 时才
 *     触发加载。只做动态 import 是不够的：effect 在挂载时就跑，动态 chunk
 *     同样会在每个详情页被下载，等于换个位置付同一笔代价。
 *
 * 当前两个调用点（TravelDetailShell / admin 的 MarkdownPreview）都在正文已提交
 * 的同一次渲染里挂载本组件，因此挂载时图表块必然已在 DOM 中。MutationObserver
 * 只是兜底「正文将来若改成异步注入」的情形，避免那时静默地不再渲染图表。
 */
export default function MermaidRenderer() {
  useEffect(() => {
    let cancelled = false
    let observer: MutationObserver | null = null

    const findBlocks = () => document.querySelectorAll('pre code.language-mermaid')

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default
        if (cancelled) return

        mermaid.initialize({
          startOnLoad: true,
          theme: 'default',
          // 安全边界：strict 下标签中的 HTML 按纯文本渲染，阻止 mermaid 输出中的
          // HTML/SVG 注入（<img onerror>、<script> 等）
          securityLevel: 'strict',
        })

        // 查找所有 mermaid 代码块并渲染
        findBlocks().forEach((block, index) => {
          const code = block.textContent || ''
          const pre = block.parentElement
          if (pre) {
            const div = document.createElement('div')
            div.className = 'mermaid'
            div.id = `mermaid-${index}`
            div.textContent = code
            pre.replaceWith(div)
          }
        })

        await mermaid.run()
      } catch (error) {
        // 图表渲染失败不应把整个详情页带崩，只记一条错误（mermaid 自身不做全局兜底）
        console.error('[MermaidRenderer] 渲染 mermaid 图表失败:', error)
      }
    }

    if (findBlocks().length > 0) {
      void render()
    } else {
      observer = new MutationObserver(() => {
        if (findBlocks().length === 0) return
        observer?.disconnect()
        observer = null
        void render()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [])

  return null
}
