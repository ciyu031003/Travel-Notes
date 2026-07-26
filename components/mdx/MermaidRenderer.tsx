'use client'

import { useEffect } from 'react'
import mermaid from 'mermaid'

export default function MermaidRenderer() {
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
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
