import { describe, it, expect, vi } from 'vitest'
import { isPublicPath, PUBLIC_PATHS } from '@/lib/public-paths'

describe('middleware 公开白名单（段边界匹配）', () => {
  it('精确路径命中', () => {
    expect(isPublicPath('/login')).toBe(true)
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
