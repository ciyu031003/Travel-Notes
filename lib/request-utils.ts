/**
 * 请求元信息提取（IP / UA / 客户端类型）与 CORS/CSRF 判定纯函数。
 *
 * 为什么集中在这里：middleware（Edge）、API 路由（Node）与单元测试三者共用同一套判定，
 * 避免「测试覆盖的逻辑」和「线上跑的判定」是两份实现。本文件只依赖 Web 标准 API，
 * 不得 import next/server，否则无法在纯 JS 单测环境里加载。
 */

/* ------------------------------- IP 提取 ------------------------------- */

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
// 粗校验 IPv6：允许十六进制与冒号（含 :: 压缩、IPv4-mapped），由下游按字符串做限流键即可；
// 这里的目的不是完整 IPv6 语法校验，而是拒绝把任意字符串（如伪造的 host 名）当 IP 用。
const IPV6_RE = /^[0-9a-f:]{2,45}$/i

/** 归一化单个 IP 字符串；非法/空返回 null */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = String(raw).trim()
  if (!value) return null
  // [::1]:443 形式
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    value = end > 0 ? value.slice(1, end) : value.slice(1)
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    // 1.2.3.4:5678（部分代理会带端口）
    value = value.slice(0, value.lastIndexOf(':'))
  }
  // IPv6 zone id（fe80::1%eth0）
  const zone = value.indexOf('%')
  if (zone > 0) value = value.slice(0, zone)
  if (IPV4_RE.test(value)) return value
  if (value.includes(':') && IPV6_RE.test(value)) return value.toLowerCase()
  return null
}

/**
 * 从 Request 中提取客户端 IP（兼容反向代理转发头）。
 *
 * 安全性（评审 S-7）：X-Forwarded-For 是**客户端可伪造**的请求头，
 * 历史实现取第一段，攻击者只要带 `X-Forwarded-For: 1.2.3.4` 就能换一个限流桶。
 * 现在：
 *  1) 优先 X-Real-IP —— 由我们自己的 Nginx 用 $remote_addr 覆写（见 docs/nginx.conf.example），
 *     客户端无法控制；
 *  2) 退化到 X-Forwarded-For 的**最后一段** —— Nginx 用 `proxy_set_header X-Forwarded-For $remote_addr`
 *     重写时整条链只有一跳，最后一段才是真实对端；
 *  3) 两处都做粗校验（IPv4/IPv6），不合法一律 null（调用方按 'unknown' 计），绝不把任意字符串当 IP。
 * 若前面还有其他代理（CDN）叠加，应让它们统一用 X-Real-IP 覆盖或配置可信代理链，不要依赖 XFF 首段。
 */
export function getClientIp(request: Request | { headers: Headers }): string | null {
  const headers = request.headers
  const realIp = normalizeIp(headers.get('x-real-ip'))
  if (realIp) return realIp
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean)
    // 从右向左取第一个合法值：最后一跳是我们自己的 Nginx，其左侧才是客户端
    for (let i = parts.length - 1; i >= 0; i--) {
      const ip = normalizeIp(parts[i])
      if (ip) return ip
    }
  }
  return null
}

/** 从 Request 中提取 User-Agent（截断长度） */
export function getUserAgent(request: Request | { headers: Headers }, maxLen = 500): string | null {
  const ua = request.headers.get('user-agent')
  if (!ua) return null
  return ua.slice(0, maxLen)
}

/* ------------------------------ Origin 工具 ------------------------------ */

/** 归一化 origin 为 `协议//host[:port]`（小写）；不可解析返回 null */
export function normalizeOrigin(origin: string | null | undefined): string | null {
  if (!origin || origin === 'null') return null
  try {
    const url = new URL(origin)
    if (!url.protocol || !url.host) return null
    return `${url.protocol}//${url.host}`.toLowerCase()
  } catch {
    return null
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  const h = (hostname || '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost')
}

function splitEnvList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 完整 origin 白名单（CORS_ALLOWED_ORIGINS，逗号分隔，如 https://a.com,capacitor://localhost）。
 * 配置后**优先**按完整 origin 精确匹配，未配置时回落到历史 hostname 行为（兼容存量部署）。
 */
export function corsAllowedOrigins(): Set<string> {
  const set = new Set<string>()
  for (const item of splitEnvList(process.env.CORS_ALLOWED_ORIGINS)) {
    const normalized = normalizeOrigin(item)
    if (normalized) set.add(normalized)
  }
  return set
}

/** 历史 hostname 白名单（CORS_ALLOWED_HOSTNAMES）；localhost/127.0.0.1 由调用方按环境决定 */
export function corsAllowedHostnames(): Set<string> {
  return new Set(splitEnvList(process.env.CORS_ALLOWED_HOSTNAMES || 'travel-notes.yuanabd.cn,106.55.2.197'))
}

/**
 * Capacitor 本地壳的固定 Origin：**生产环境也必须放行**。
 * - Android WebView：https://localhost
 * - iOS WKWebView：capacitor://localhost
 * App 的跨域 API 请求全部来自这两个 Origin（见 lib/api-base.ts），若按普通 localhost 规则
 * 在生产拦掉，线上 App 会整体不可用。这里用**完整 origin 精确匹配**（不放宽 http://localhost
 * 或其它端口），既保住 App，也不会让浏览器侧任意本地页面借到凭据。
 */
const APP_SHELL_ORIGINS = new Set(['https://localhost', 'capacitor://localhost'])

/**
 * 判定是否对某个 Origin 回显 CORS 头。返回**需要回显的原始 Origin 字符串**或 null。
 *
 * 规则（评审 S-12）：
 * 1) Capacitor 本地壳（https://localhost / capacitor://localhost）始终放行（上面常量，生产同样）；
 * 2) 配置了 CORS_ALLOWED_ORIGINS → 只认完整 origin 精确匹配（不再按 hostname 模糊放行）；
 * 3) 未配置 → 保持历史 hostname 行为；localhost/127.0.0.1（http 或其它端口）只在非生产放行；
 * 4) Origin 缺失/为 'null'/不可解析 → 不回显。
 */
export function resolveCorsOrigin(request: { headers: Headers }): string | null {
  const raw = request.headers.get('origin')
  if (!raw) return null
  const normalized = normalizeOrigin(raw)
  if (!normalized) return null

  // 1) App 本地壳：精确 origin，始终允许（带凭据）
  if (APP_SHELL_ORIGINS.has(normalized)) return raw

  // 2) 显式配置的完整 origin 白名单优先
  const configured = corsAllowedOrigins()
  if (configured.size > 0) {
    return configured.has(normalized) ? raw : null
  }

  // 3) 历史 hostname 兼容逻辑（未配置 CORS_ALLOWED_ORIGINS 时）
  let hostname = ''
  try {
    hostname = new URL(raw).hostname
  } catch {
    return null
  }
  if (isLoopbackHostname(hostname)) {
    // 浏览器侧的普通本地源（http://localhost 等）只在非生产放行
    if (process.env.NODE_ENV === 'production') return null
    return raw
  }
  return corsAllowedHostnames().has(hostname) ? raw : null
}

/**
 * CSRF 兜底判定：Origin 为 'null' 或不可解析（例如跨站跳转后某些 WebView、透明代理），
 * 若浏览器已明确标注 `Sec-Fetch-Site: cross-site`，则视为跨站请求 → 应 403。
 *
 * 为什么不无条件拒绝 'null'：Capacitor WebView / 微信内置浏览器会发 Origin: null，
 * 硬拒绝会让 App 内的写请求全部失败（真机回归风险）。只有浏览器自己声明 cross-site 才拒绝，
 * 保证「App 兼容」与「跨站写请求拦截」同时成立。
 */
export function isUnverifiableCrossSiteRequest(request: { headers: Headers }): boolean {
  const crossSite = (request.headers.get('sec-fetch-site') || '').toLowerCase() === 'cross-site'
  if (!crossSite) return false
  const raw = request.headers.get('origin')
  // 完全无 Origin 的请求是 curl/服务间调用，维持历史放行（浏览器跨站写请求一定会带 Origin）
  if (!raw) return false
  if (raw === 'null') return true
  return normalizeOrigin(raw) === null
}

/**
 * 客户端类型判定（App vs Web）。登录/注册由请求体 clientType 显式声明（沿用现状）；
 * check-auth 是 GET 没有请求体，因此按以下信号判定，任一命中即视为 App：
 * 1) `x-client-type: app` 请求头（新版本 App 显式声明，向前兼容）；
 * 2) `?clientType=app` 查询参数；
 * 3) UA 含 TravelNotesApp；
 * 4) Origin 是 Capacitor 本地壳（capacitor://localhost / ionic://localhost / https://localhost）。
 * 同源 GET 浏览器不带 Origin，所以 Web 端不会被误判成 App。
 */
export function isAppClientRequest(request: { headers: Headers; url?: string }): boolean {
  if ((request.headers.get('x-client-type') || '').toLowerCase() === 'app') return true
  if (request.url) {
    try {
      if (new URL(request.url).searchParams.get('clientType') === 'app') return true
    } catch {
      /* 非法 URL 忽略 */
    }
  }
  const ua = request.headers.get('user-agent') || ''
  if (ua.includes('TravelNotesApp')) return true
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const url = new URL(origin)
    if (url.protocol === 'capacitor:' || url.protocol === 'ionic:') return true
    return isLoopbackHostname(url.hostname)
  } catch {
    return false
  }
}
