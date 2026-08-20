// 仅在安全上下文（HTTPS / localhost）注册 Service Worker；纯 HTTP 静默跳过
if ('serviceWorker' in navigator) {
  const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (secure) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}
