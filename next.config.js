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
  // - 项目未配置 ESLint，构建期跳过 lint 步骤可显著降低内存与耗时
  // - 类型检查默认保留；极端低内存服务器可设置 SKIP_TSC=1 跳过（不推荐）
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TSC === '1',
  },
}

module.exports = nextConfig
