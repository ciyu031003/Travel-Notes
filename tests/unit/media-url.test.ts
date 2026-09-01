import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { absoluteMediaUrl, siteBaseUrl } from '@/lib/media-url'

describe('absoluteMediaUrl（M0 · B1 移动端媒体绝对 URL）', () => {
  const SITE = 'https://travel-notes.yuanabd.cn'

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE
  })
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_API_BASE
  })

  it('相对 /uploads 路径补成绝对地址', () => {
    expect(absoluteMediaUrl('/uploads/media/1.jpg')).toBe(SITE + '/uploads/media/1.jpg')
  })

  it('相对 /api/images/N 补成绝对地址', () => {
    expect(absoluteMediaUrl('/api/images/12')).toBe(SITE + '/api/images/12')
  })

  it('已是绝对地址原样返回（对象存储/CDN）', () => {
    const cdn = 'https://cdn.example.com/travel/1.jpg'
    expect(absoluteMediaUrl(cdn)).toBe(cdn)
  })

  it('协议相对 // 补 https', () => {
    expect(absoluteMediaUrl('//cdn.example.com/1.jpg')).toBe('https://cdn.example.com/1.jpg')
  })

  it('null / 空 原样返回 null', () => {
    expect(absoluteMediaUrl(null)).toBeNull()
    expect(absoluteMediaUrl(undefined)).toBeNull()
    expect(absoluteMediaUrl('')).toBeNull()
  })

  it('未配置站点 URL 时保持相对路径（不破坏无域名部署/测试）', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(absoluteMediaUrl('/uploads/1.jpg')).toBe('/uploads/1.jpg')
  })

  it('siteBaseUrl 回退 NEXT_PUBLIC_API_BASE', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_API_BASE = 'https://api.example.com/'
    expect(siteBaseUrl()).toBe('https://api.example.com')
  })
})
