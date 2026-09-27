'use client'

import { useEffect } from 'react'

/** 与 --m-bg 双主题值保持一致（app/mobile.css） */
const LIGHT = '#FFFBF7'
const DARK = '#100C0A'

function apply() {
  const dark = document.documentElement.classList.contains('dark')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = dark ? DARK : LIGHT
}

/**
 * theme-color 随暗色类切换实时同步（浏览器地址栏 / 任务切换器底色）。
 * 走 MutationObserver 监听 <html> 的 class，任何切换入口（Navbar / SocialThemeToggle /
 * 系统初始化脚本）都无需各自埋点；原生壳内的状态栏颜色由 StatusBar 插件另行接管。
 */
export default function ThemeColorSync() {
  useEffect(() => {
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])
  return null
}
