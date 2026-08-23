// Travel-Notes Service Worker（Stage 3.0b PWA 壳缓存）
// 策略：
//  - 页面导航：网络优先，失败回退缓存（断网可开已缓存的首页）
//  - 静态资源（_next/ 与图片/字体）：缓存优先 + 后台更新
//  - API GET（排除 /api/admin/）：网络优先，失败回退缓存（stale-while-revalidate）
const SHELL_CACHE = 'tiantu-shell-v1'
const ASSET_CACHE = 'tiantu-assets-v1'
const API_CACHE = 'tiantu-api-v1'

// 首屏预缓存（安装时写入，断网冷启动可直接命中）
const PRECACHE_URLS = ['/', '/login', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            fetch(url)
              .then((res) => {
                if (res.ok) cache.put(url, res)
              })
              .catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![SHELL_CACHE, ASSET_CACHE, API_CACHE].includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return

  // 页面导航：网络优先，回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    )
    return
  }

  // 静态资源：缓存优先 + 后台更新
  if (url.pathname.startsWith('/_next/') || /\.(js|css|png|jpg|jpeg|webp|gif|svg|woff2?|ttf|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy))
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
    return
  }

  // API GET（排除后台）：网络优先，失败回退缓存
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/admin/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(API_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req))
    )
  }
})
