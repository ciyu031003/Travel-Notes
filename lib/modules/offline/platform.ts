/**
 * 平台探测：区分 Capacitor 原生容器 vs 浏览器。
 * 不 import Capacitor，改用 window.Capacitor 运行时探测，避免 SSR/Web 构建报错。
 */

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

export function isWebPlatform(): boolean {
  return !isNativePlatform()
}
