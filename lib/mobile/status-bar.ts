/**
 * 原生状态栏随主题联动（仅 Capacitor 容器生效，Web 端 no-op）：
 * - 图标风格：亮色页面用深色图标（Style.Light），暗色页面用浅色图标（Style.Dark）；
 * - 背景色与 --m-bg 对齐，消除状态栏区域与页面的色断层。
 * - Android WebView 的 env(safe-area-inset-top) 在某些 ROM/WebView 版本下为 0，
 *   因此同步 StatusBar.getInfo().height 到 --m-status-bar-height，供 CSS 取 max() 兜底。
 * 所有调用吞错：状态栏失败不应影响主流程（个别 Android 版本/ROM 可能不支持）。
 */

import { isNativePlatform } from '@/lib/modules/offline/platform'

/** 与 app/mobile.css 的 --m-bg 双主题值保持一致 */
export const THEME_BG_LIGHT = '#FFFBF7'
export const THEME_BG_DARK = '#100C0A'

function applyStatusBarCssHeight(height: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--m-status-bar-height', `${Math.max(0, height)}px`)
}

export async function syncNativeStatusBar(dark: boolean): Promise<void> {
  if (!isNativePlatform()) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')

  // Android 15+ 会拒绝部分状态栏颜色 API，必须先独立读取高度，避免安全区同步被一起跳过。
  try {
    const info = await StatusBar.getInfo()
    applyStatusBarCssHeight(info.visible && info.overlays ? info.height : 0)
  } catch {
    // 老版本或受限 ROM 可能不支持 getInfo，继续保留 CSS env() 兜底。
  }

  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  } catch {
    // 图标风格失败不影响背景色与页面主流程。
  }

  try {
    await StatusBar.setBackgroundColor({ color: dark ? THEME_BG_DARK : THEME_BG_LIGHT })
  } catch {
    // Android 15+ 可能不允许应用覆盖状态栏颜色：最外层已用 --m-bg 衔接。
  }
}
