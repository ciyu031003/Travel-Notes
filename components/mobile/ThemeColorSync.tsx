'use client'

import { useEffect } from 'react'
import {
  syncNativeStatusBar,
  THEME_BG_DARK,
  THEME_BG_LIGHT,
} from '@/lib/mobile/status-bar'

function apply() {
  const dark = document.documentElement.classList.contains('dark')
  // Web：浏览器地址栏/任务切换器底色
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = dark ? THEME_BG_DARK : THEME_BG_LIGHT
  // 原生壳：状态栏图标与底色随主题联动（Web 端 no-op）
  void syncNativeStatusBar(dark)
}

/**
 * 主题色同步：
 * - meta theme-color 随暗色类切换实时同步；
 * - Capacitor 原生状态栏随暗色类切换实时同步。
 * 走 MutationObserver 监听 <html> 的 class，任何切换入口（Navbar / SocialThemeToggle /
 * 系统初始化脚本）都无需各自埋点。
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
