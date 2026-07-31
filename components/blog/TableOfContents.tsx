'use client'

import { useEffect, useState } from 'react'
import { List } from 'lucide-react'

interface TocItem {
  level: number
  text: string
  id: string
}

interface TableOfContentsProps {
  toc: TocItem[]
}

export default function TableOfContents({ toc }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    if (!toc || toc.length === 0) return

    const ids = toc.map(item => item.id)
    const headings = ids
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-80px 0px -70% 0px',
        threshold: 0,
      },
    )

    headings.forEach(el => observer.observe(el))

    return () => {
      observer.disconnect()
    }
  }, [toc])

  if (!toc || toc.length === 0) return null

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const target = document.getElementById(id)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // 修正 sticky header 高度（如有）
      window.history.replaceState(null, '', `#${id}`)
    }
  }

  return (
    <nav className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-thin">
      <div className="flex items-center gap-2 mb-4 text-sm font-medium text-gray-700 dark:text-gray-200">
        <List className="w-4 h-4 text-rose-400" />
        <span>目录</span>
      </div>
      <ul className="space-y-1 border-l border-gray-100 dark:border-gray-700">
        {toc.map(item => {
          const isActive = activeId === item.id
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => handleClick(e, item.id)}
                className={[
                  'block text-sm py-1.5 pr-2 transition-colors -ml-px border-l-2',
                  item.level === 3 ? 'pl-6' : 'pl-3',
                  isActive
                    ? 'border-primary-500 text-primary-500 font-medium'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-primary-500',
                ].join(' ')}
              >
                {item.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
