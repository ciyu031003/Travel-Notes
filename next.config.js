/** @type {import('next').NextConfig} */
const MOBILE_EXPORT = process.env.MOBILE_EXPORT === '1'

/**
 * 把「站点地址 / 存储公开地址 / 额外主机」解析成 next/image 的 remotePatterns。
 *
 * P2-27：此前是 `{ protocol: 'https', hostname: '**' }` —— 任意远端大图都能被
 * next/image 当免费图床（同时是 CPU 放大器）。现在收窄为可配置白名单：
 *   · NEXT_PUBLIC_SITE_URL       站点自身 host（同源图片走相对路径时其实不需要，但兜底）
 *   · STORAGE_PUBLIC_BASE_URL    COS/S3/CDN 公开域名（生产图片实际来源）
 *   · IMAGE_REMOTE_HOSTS         逗号分隔的额外域名（迁移期兜底）
 * 三者都没有配置时**回退到 `**` 并告警**，保证老部署不受影响、但能看见风险提示。
 */
function parseRemotePattern(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return {
      protocol: url.protocol.replace(':', ''),
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    }
  } catch {
    // 允许只写主机名（如 cdn.example.com 或 cdn.example.com:8443）
    const match = /^([a-z0-9.-]+)(?::(\d+))?$/i.exec(value)
    if (!match) return null
    return { protocol: 'https', hostname: match[1], ...(match[2] ? { port: match[2] } : {}) }
  }
}

function resolveRemotePatterns() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.STORAGE_PUBLIC_BASE_URL,
    ...(process.env.IMAGE_REMOTE_HOSTS || '').split(','),
  ]
  const patterns = []
  const seen = new Set()
  for (const candidate of candidates) {
    const pattern = parseRemotePattern(candidate)
    if (!pattern) continue
    const key = `${pattern.protocol}|${pattern.hostname}|${pattern.port || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    patterns.push(pattern)
  }
  if (patterns.length === 0) {
    // 兼容回退：未配置白名单时保持历史行为，但必须显式告警（生产应配置真实域名）
    console.warn(
      '[next.config] 未配置 NEXT_PUBLIC_SITE_URL / STORAGE_PUBLIC_BASE_URL / IMAGE_REMOTE_HOSTS，' +
        'images.remotePatterns 回退为 https:**（允许任意远端主机）。生产环境请配置白名单域名。',
    )
    return [{ protocol: 'https', hostname: '**' }]
  }
  return patterns
}

const nextConfig = {
  reactStrictMode: true,
  // 并行验证用：多个会话/构建同时跑同一份源码时，用独立 distDir 避免互相覆盖 .next
  // （默认仍是 .next，不影响任何既有构建/部署流程）。
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  // 移动端本地壳（Stage 3.0b）：MOBILE_EXPORT=1 时做静态导出（输出到 out/，再由脚本拷到 www/）。
  // Web/服务器构建不设该变量，保持 SSR/ISR 正常。
  output: MOBILE_EXPORT ? 'export' : undefined,
  images: {
    remotePatterns: resolveRemotePatterns(),
    // P2-27：现代格式优先（体积通常比 JPEG/PNG 小 25–50%），浏览器不支持会自动回退原格式
    formats: ['image/avif', 'image/webp'],
    // 静态导出无 next/image 优化服务，需 unoptimized
    unoptimized: MOBILE_EXPORT ? true : undefined,
  },
  // 低内存构建优化：
  // - Next 16 已移除 next lint / 构建期 ESLint，lint 一律走独立命令：`npm run lint`（ESLint 10 flat config，
  //   warning 预算收敛在 package.json 脚本里，CI/Dockerfile 只调该命令）；因此这里不再声明 eslint 配置（Next 16 会报 Unrecognized key）。
  // - 类型检查默认保留；极端低内存服务器可设置 SKIP_TSC=1 跳过（不推荐）
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TSC === '1',
  },
  experimental: {
    /**
     * 客户端 Router Cache（移动端切页体感，2026-11-21 性能专项 D）
     *
     * Next 16 默认 staleTimes.dynamic = 0：动态路由（本项目首页 / 是 ƒ 动态渲染）
     * 每次返回都重新发一次 RSC 请求并整页重渲染，移动端 tab 来回切时表现为
     * 「白一下 / 顿一下」。这里给 30s 窗口：首页 ⇄ /travel ⇄ /circle ⇄ /me
     * 在 30s 内复用已缓存的 RSC 负载（数据新鲜度仍由各页接口缓存 + 聚焦重取负责，
     * 见 lib/client/use-api.ts、hooks/use-travel-list.ts）。
     * static 保持框架默认（300s），不在此覆盖。
     */
    staleTimes: { dynamic: 30 },
    /**
     * 注意：optimizePackageImports 对 lucide-react / date-fns 已是 **Next 内置默认**
     * （见 node_modules/next/dist/server/config.js 的默认列表），重复声明是空操作，
     * 故此处不再列出。本项目其它 barrel 包（react-virtuoso / motion / gsap / three）
     * 均为单文件发布、没有可深导入的子路径，声明后会把 pkg/Member 解析到不存在的
     * 文件导致构建失败，因此也不加入 —— 对这几者的收益改由「按需 dynamic 导入」实现。
     */
  },
}

module.exports = nextConfig
