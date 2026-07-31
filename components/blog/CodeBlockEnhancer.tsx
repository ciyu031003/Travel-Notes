'use client'

import { useEffect } from 'react'

const ENHANCED_ATTR = 'data-code-enhanced'

export default function CodeBlockEnhancer() {
  useEffect(() => {
    const enhancePre = (pre: HTMLPreElement) => {
      if (pre.hasAttribute(ENHANCED_ATTR)) return
      pre.setAttribute(ENHANCED_ATTR, 'true')
      pre.classList.add('relative')

      const code = pre.querySelector('code')
      if (!code) return

      // 语言标签（左上角）
      const langMatch = /language-([\w-]+)/.exec(code.className)
      if (langMatch && langMatch[1]) {
        const lang = langMatch[1]
        const langLabel = document.createElement('span')
        langLabel.className =
          'absolute top-2 left-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 select-none pointer-events-none'
        langLabel.textContent = lang
        pre.appendChild(langLabel)
      }

      // 复制按钮（右上角）
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('aria-label', '复制代码')
      btn.className =
        'absolute top-2 right-2 p-1.5 rounded-md bg-gray-800/60 text-gray-200 hover:bg-gray-700 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity backdrop-blur-sm'
      const iconCopy = document.createElement('span')
      iconCopy.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      const iconCheck = document.createElement('span')
      iconCheck.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      iconCheck.style.display = 'none'
      btn.appendChild(iconCopy)
      btn.appendChild(iconCheck)

      btn.addEventListener('click', async () => {
        const text = code.textContent || ''
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          // 降级
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          try { document.execCommand('copy') } catch {}
          document.body.removeChild(ta)
        }
        iconCopy.style.display = 'none'
        iconCheck.style.display = 'inline'
        setTimeout(() => {
          iconCopy.style.display = 'inline'
          iconCheck.style.display = 'none'
        }, 2000)
      })

      pre.appendChild(btn)

      // 启用 group-hover：给 pre 添加 group 类
      pre.classList.add('group')
    }

    const enhanceAll = () => {
      const pres = document.querySelectorAll<HTMLPreElement>('pre')
      pres.forEach(enhancePre)
    }

    enhanceAll()

    // 监听 DOM 变化（路由切换后内容重新挂载）
    const observer = new MutationObserver(() => {
      enhanceAll()
    })

    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [])

  return null
}
