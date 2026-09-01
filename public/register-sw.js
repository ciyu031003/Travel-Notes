// 原生容器（Capacitor）内跳过 Service Worker：壳更新走 OTA/APK，SW 缓存旧壳反而干扰新壳。
// 仅在安全上下文（HTTPS / localhost）注册 Service Worker；纯 HTTP 静默跳过。
const isNativeShell =
  typeof window !== 'undefined' &&
  typeof window.Capacitor !== 'undefined' &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform()

if (!isNativeShell && 'serviceWorker' in navigator) {
  const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (secure) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}
