'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function SocialThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    // 默认亮色（社交页 = 旅行圈/旅行档案统一默认亮色），仅当用户显式选择暗色时进入暗色
    const next = saved === 'dark'
    document.documentElement.classList.toggle('dark', next)
    setDark(next)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <button type="button" onClick={toggle} aria-label={dark ? '切换到明亮模式' : '切换到暗黑模式'}
      className={'rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] ' + (className || '')}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
