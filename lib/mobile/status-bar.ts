/**
 * 原生状态栏随主题联动（仅 Capacitor 容器生效，Web 端 no-op）：
 * - 图标风格：亮色页面用深色图标（Style.Light），暗色页面用浅色图标（Style.Dark）；
 * - 背景色与 --m-bg 对齐，消除状态栏区域与页面的色断层。
 * 所有调用吞错：状态栏失败不应影响主流程（个别 Android 版本/ROM 可能不支持）。
 */

import { isNativePlatform } from '@/lib/modules/offline/platform'

/** 与 app/mobile.css 的 --m-bg 双主题值保持一致 */
export const THEME_BG_LIGHT = '#FFFBF7'
export const THEME_BG_DARK = '#100C0A'

export async function syncNativeStatusBar(dark: boolean): Promise<void> {
  if (!isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: dark ? THEME_BG_DARK : THEME_BG_LIGHT })
  } catch {
    // 静默降级：状态栏样式失败不阻塞主流程
  }
}
