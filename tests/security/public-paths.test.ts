import { describe, it, expect, vi } from 'vitest'
import { isPublicPath, isPublicRequest, isStaticAssetPath, PUBLIC_PATHS, PUBLIC_READ_PATHS } from '@/lib/public-paths'

describe('middleware 公开白名单（段边界匹配）', () => {
  it('精确路径命中', () => {
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/download')).toBe(true)
    expect(isPublicPath('/api/health')).toBe(true)
    expect(isPublicPath('/api/version')).toBe(true)
  })

  it('子路径命中（登录/验证码/上传等带子路由的公开前缀）', () => {
    expect(isPublicPath('/api/forgot-password/send-code')).toBe(true)
    expect(isPublicPath('/api/admin/setup')).toBe(true)
    expect(isPublicPath('/uploads/videos/demo.mp4')).toBe(true)
    expect(isPublicPath('/api/uploads/photo-thumbnail.jpg')).toBe(true)
    expect(isPublicPath('/_next/static/chunk.js')).toBe(true)
  })

  it('段边界外的前缀不误放', () => {
    expect(isPublicPath('/api/login-xyz')).toBe(false)
    expect(isPublicPath('/uploads-evil/secret')).toBe(false)
    expect(isPublicPath('/api/healthcheck')).toBe(false)
  })

  it('/api/admin/settings 不再整段公开（各子路由自带鉴权）', () => {
    expect(isPublicPath('/api/admin/settings')).toBe(false)
    expect(isPublicPath('/api/admin/settings/password')).toBe(false)
  })

  it('白名单本身无重复/无前缀包含陷阱', () => {
    expect(new Set(PUBLIC_PATHS).size).toBe(PUBLIC_PATHS.length)
  })

  it('受保护页面不放行', () => {
    expect(isPublicPath('/travel')).toBe(false)
    expect(isPublicPath('/album')).toBe(false)
    expect(isPublicPath('/admin')).toBe(false)
    expect(isPublicPath('/api/me')).toBe(false)
    expect(isPublicPath('/api/travel-book')).toBe(false)
  })
})

describe('isPublicRequest（公开内容读路径 · 游客可浏览公开内容）', () => {
  it('公开内容 API 的 GET 放行', () => {
    expect(isPublicRequest('/api/travels', 'GET')).toBe(true)
    expect(isPublicRequest('/api/home', 'GET')).toBe(true)
    expect(isPublicRequest('/api/timeline', 'GET')).toBe(true)
    expect(isPublicRequest('/api/dashboard', 'GET')).toBe(true)
    expect(isPublicRequest('/api/moments', 'GET')).toBe(true)
    expect(isPublicRequest('/api/search', 'GET')).toBe(true)
    expect(isPublicRequest('/api/social/posts', 'GET')).toBe(true)
    expect(isPublicRequest('/api/social/users/1', 'GET')).toBe(true)
    expect(isPublicRequest('/api/travel-book', 'GET')).toBe(true)
    expect(isPublicRequest('/api/album', 'GET')).toBe(true)
    expect(isPublicRequest('/api/anniversaries', 'GET')).toBe(true)
    expect(isPublicRequest('/api/danmaku', 'GET')).toBe(true)
    expect(isPublicRequest('/api/images/12', 'GET')).toBe(true)
    expect(isPublicRequest('/feed.xml', 'GET')).toBe(true)
  })

  it('公开内容路径的写请求不放行（记录需登录）', () => {
    expect(isPublicRequest('/api/travels', 'POST')).toBe(false)
    expect(isPublicRequest('/api/moments', 'POST')).toBe(false)
    expect(isPublicRequest('/api/social/posts', 'POST')).toBe(false)
    expect(isPublicRequest('/api/album', 'POST')).toBe(false)
    expect(isPublicRequest('/api/travel-book', 'DELETE')).toBe(false)
  })

  it('私人接口与页面不放行', () => {
    expect(isPublicRequest('/api/me', 'GET')).toBe(false)
    expect(isPublicRequest('/travel', 'GET')).toBe(false)
    expect(isPublicRequest('/admin', 'GET')).toBe(false)
    expect(isPublicRequest('/api/admin/settings', 'GET')).toBe(false)
    expect(isPublicRequest('/api/export/archive', 'GET')).toBe(false)
  })

  it('完全公开路径不区分方法（登录/注册/健康等）', () => {
    expect(isPublicRequest('/api/login', 'POST')).toBe(true)
    expect(isPublicRequest('/api/register', 'POST')).toBe(true)
    expect(isPublicRequest('/api/health', 'GET')).toBe(true)
    expect(isPublicRequest('/api/check-auth', 'GET')).toBe(true)
  })

  it('白名单无重复项', () => {
    expect(new Set(PUBLIC_READ_PATHS).size).toBe(PUBLIC_READ_PATHS.length)
  })
})

describe('isStaticAssetPath（含点动态段不再绕过登录门禁）', () => {
  it('已知静态扩展名豁免', () => {
    expect(isStaticAssetPath('/icon.png')).toBe(true)
    expect(isStaticAssetPath('/fonts/inter.woff2')).toBe(true)
    expect(isStaticAssetPath('/sw.js')).toBe(true)
    expect(isStaticAssetPath('/manifest.webmanifest')).toBe(true)
    expect(isStaticAssetPath('/robots.txt')).toBe(true)
    expect(isStaticAssetPath('/videos/clover.mp4')).toBe(true)
    expect(isStaticAssetPath('/favicon.ico')).toBe(true)
  })

  it('带点动态段不再豁免（修复的绕过向量）', () => {
    expect(isStaticAssetPath('/travel/abc.def')).toBe(false)
    expect(isStaticAssetPath('/me/settings')).toBe(false)
    expect(isStaticAssetPath('/admin/social')).toBe(false)
  })

  it('/api/ 一律不豁免（数据安全优先）', () => {
    expect(isStaticAssetPath('/api/social/posts/1.json')).toBe(false)
    expect(isStaticAssetPath('/api/travels/x.js')).toBe(false)
    expect(isStaticAssetPath('/api/uploads/photo.jpg')).toBe(false)
  })

  it('大小写不敏感', () => {
    expect(isStaticAssetPath('/icon.PNG')).toBe(true)
    expect(isStaticAssetPath('/font.WOFF2')).toBe(true)
  })
})
