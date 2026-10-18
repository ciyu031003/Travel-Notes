import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getClientIp,
  normalizeIp,
  normalizeOrigin,
  resolveCorsOrigin,
  isUnverifiableCrossSiteRequest,
  isAppClientRequest,
} from '@/lib/request-utils'

function req(headers: Record<string, string>, url = 'http://example.com/api/x') {
  return { headers: new Headers(headers), url }
}

const ENV_KEYS = ['CORS_ALLOWED_ORIGINS', 'CORS_ALLOWED_HOSTNAMES'] as const

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('getClientIp（P1-11 XFF 伪造防护）', () => {
  it('伪造的 XFF 首段不会被采用（取最后一段）', () => {
    // 攻击者自带 X-Forwarded-For: 1.2.3.4，Nginx 追加/重写后真实客户端在最后
    const ip = getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))
    expect(ip).toBe('203.0.113.9')
  })

  it('单跳 XFF 取该段', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('X-Real-IP 优先于 XFF（Nginx 用 $remote_addr 覆盖写入，客户端不可伪造）', () => {
    const ip = getClientIp(req({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4' }))
    expect(ip).toBe('203.0.113.9')
  })

  it('非法 IP 一律 null（不把任意字符串当 IP 用）', () => {
    expect(getClientIp(req({ 'x-forwarded-for': 'evil.example.com' }))).toBeNull()
    expect(getClientIp(req({ 'x-real-ip': 'not-an-ip', 'x-forwarded-for': '999.1.1.1' }))).toBeNull()
    expect(getClientIp(req({}))).toBeNull()
  })

  it('skip 非法段直到找到合法 IP（链尾是我们自己的 Nginx）', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, bogus, 203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('支持 IPv6 与方括号/端口形式', () => {
    expect(normalizeIp('::1')).toBe('::1')
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8::1')
    expect(normalizeIp('203.0.113.9:8080')).toBe('203.0.113.9')
  })
})

describe('CSRF：不可校验的跨站请求（P1-13）', () => {
  it("Origin 为 'null' 且 Sec-Fetch-Site: cross-site → 应视为跨站", () => {
    expect(isUnverifiableCrossSiteRequest(req({ origin: 'null', 'sec-fetch-site': 'cross-site' }))).toBe(true)
  })

  it("Origin 为 'null' 但没有 cross-site 标记（Capacitor WebView）→ 放行", () => {
    expect(isUnverifiableCrossSiteRequest(req({ origin: 'null' }))).toBe(false)
    expect(isUnverifiableCrossSiteRequest(req({ origin: 'null', 'sec-fetch-site': 'same-origin' }))).toBe(false)
  })

  it('同源请求即使不可解析 Origin 也不误伤', () => {
    expect(isUnverifiableCrossSiteRequest(req({ origin: 'https://example.com', 'sec-fetch-site': 'same-origin' }))).toBe(false)
  })
})

describe('CORS 判定（P1-13）', () => {
  it('Origin 为 null/缺失 → 不回显', () => {
    expect(resolveCorsOrigin(req({}))).toBeNull()
    expect(resolveCorsOrigin(req({ origin: 'null' }))).toBeNull()
  })

  it('配置 CORS_ALLOWED_ORIGINS 后按完整 origin 精确匹配', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://a.example.com,capacitor://localhost'
    expect(resolveCorsOrigin(req({ origin: 'https://a.example.com' }))).toBe('https://a.example.com')
    // 同 hostname 不同 scheme/端口不放行（这正是完整 origin 匹配的目的）
    expect(resolveCorsOrigin(req({ origin: 'http://a.example.com' }))).toBeNull()
    expect(resolveCorsOrigin(req({ origin: 'https://b.example.com' }))).toBeNull()
    expect(resolveCorsOrigin(req({ origin: 'capacitor://localhost' }))).toBe('capacitor://localhost')
  })

  it('未配置完整 origin 时保持历史 hostname 行为，localhost 非生产放行', () => {
    process.env.CORS_ALLOWED_HOSTNAMES = 'travel-notes.yuanabd.cn'
    expect(resolveCorsOrigin(req({ origin: 'https://travel-notes.yuanabd.cn' }))).toBe('https://travel-notes.yuanabd.cn')
    expect(resolveCorsOrigin(req({ origin: 'https://evil.example.com' }))).toBeNull()
    // NODE_ENV=test（非生产）→ localhost 放行
    expect(resolveCorsOrigin(req({ origin: 'https://localhost' }))).toBe('https://localhost')
  })

  it('生产环境 Capacitor 本地壳 origin 始终放行（完整 origin 精确匹配，App 兼容）', () => {
    try {
      vi.stubEnv('NODE_ENV', 'production')
      // Android WebView / iOS WKWebView 的固定 origin：生产也必须允许，否则线上 App 全挂
      expect(resolveCorsOrigin(req({ origin: 'https://localhost' }))).toBe('https://localhost')
      expect(resolveCorsOrigin(req({ origin: 'capacitor://localhost' }))).toBe('capacitor://localhost')
      // 浏览器侧普通本地源/其它端口仍然收紧
      expect(resolveCorsOrigin(req({ origin: 'http://localhost' }))).toBeNull()
      expect(resolveCorsOrigin(req({ origin: 'https://localhost:8443' }))).toBeNull()
      expect(resolveCorsOrigin(req({ origin: 'http://127.0.0.1' }))).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('App 客户端判定：本地壳 Origin 视为 App，同源 GET 不算', () => {
    expect(isAppClientRequest(req({ origin: 'https://localhost' }))).toBe(true)
    expect(isAppClientRequest(req({ origin: 'capacitor://localhost' }))).toBe(true)
    expect(isAppClientRequest(req({ 'x-client-type': 'app' }))).toBe(true)
    expect(isAppClientRequest(req({}, 'http://example.com/api/check-auth?clientType=app'))).toBe(true)
    expect(isAppClientRequest(req({}))).toBe(false)
  })

  it('normalizeOrigin 对不可解析值返回 null', () => {
    expect(normalizeOrigin('null')).toBeNull()
    expect(normalizeOrigin('not a url')).toBeNull()
    expect(normalizeOrigin('https://Example.com:443/x')).toBe('https://example.com')
  })
})