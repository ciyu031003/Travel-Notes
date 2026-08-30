import { describe, it, expect } from 'vitest'
import { resolveImageUrl } from '@/lib/modules/oil-paint/oil-paint.service'

/**
 * 油画链路 SSRF 防护（权威门）：
 * resolveImageUrl 必须只放行「与 serverOrigin 同源」的 URL。
 * WHATWG URL 会把 `/\evil.com`、`\\evil.com` 的反斜杠归一为 `/`，
 * 简单字符串前缀拦截可被绕过——这些用例即历史绕过向量，回归测试防复发。
 */

describe('oil-paint resolveImageUrl 同源校验（SSRF）', () => {
  it('本站相对路径放行并解析为同源绝对 URL', () => {
    const resolved = resolveImageUrl('/uploads/albums/1/photo.jpg')
    expect(resolved.startsWith('http://127.0.0.1:3000/')).toBe(true)
  })

  it('本站 API 路径放行', () => {
    const resolved = resolveImageUrl('/api/images/123')
    expect(resolved).toBe('http://127.0.0.1:3000/api/images/123')
  })

  it.each([
    '/\\evil.com/x',
    '\\\\evil.com/x',
    '/\\/evil.com/x',
    'https://evil.com/x',
    'http://169.254.169.254/latest/meta-data',
    '//evil.com/x',
    'data:image/png;base64,AAAA',
    'file:///etc/passwd',
    'ftp://evil.com/x',
  ])('拒绝非同源/危险协议: %s', (payload) => {
    expect(() => resolveImageUrl(payload)).toThrow()
  })
})
