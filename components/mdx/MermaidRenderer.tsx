'use client'

import { useEffect } from 'react'
import mermaid from 'mermaid'

export default function MermaidRenderer() {
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      // 安全边界：strict 下标签中的 HTML 按纯文本渲染，阻止 mermaid 输出中的
      // HTML/SVG 注入（<img onerror>、<script> 等）
      securityLevel: 'strict',
    })

    // 查找所有 mermaid 代码块并渲染
    const mermaidBlocks = document.querySelectorAll('pre code.language-mermaid')
    mermaidBlocks.forEach((block, index) => {
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

    mermaid.run()
  }, [])

  return null
}
