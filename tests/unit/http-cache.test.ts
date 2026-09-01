import { describe, it, expect } from 'vitest'
import { NextResponse } from 'next/server'
import { cacheControlHeader, applyCacheControl } from '@/lib/http-cache'

describe('cacheControlHeader（阶段 A · A1）', () => {
  it('public 范围：浏览器 + 共享缓存都可缓存', () => {
    const h = cacheControlHeader('public', false)
    expect(h).toContain('public')
    expect(h).toContain('s-maxage=60')
    expect(h).toContain('max-age=30')
    expect(h).not.toContain('private')
  })

  it('user 范围 + 未登录：公开子集，可公开缓存', () => {
    const h = cacheControlHeader('user', false)
    expect(h).toContain('public')
    expect(h).toContain('s-maxage')
  })

  it('user 范围 + 已登录：私有缓存，不进共享缓存', () => {
    const h = cacheControlHeader('user', true)
    expect(h).toContain('private')
    expect(h).not.toContain('s-maxage')
  })

  it('private 范围：始终私有缓存', () => {
    expect(cacheControlHeader('private', false)).toContain('private')
    expect(cacheControlHeader('private', true)).toContain('private')
    expect(cacheControlHeader('private', true)).not.toContain('s-maxage')
  })

  it('支持自定义 TTL', () => {
    const h = cacheControlHeader('public', false, { maxAge: 300, sMaxAge: 300, swr: 600 })
    expect(h).toContain('max-age=300')
    expect(h).toContain('s-maxage=300')
    expect(h).toContain('stale-while-revalidate=600')
  })
})

describe('applyCacheControl', () => {
  it('设置 Cache-Control 头', () => {
    const res = NextResponse.json({ ok: true })
    applyCacheControl(res, 'public', false)
    expect(res.headers.get('cache-control')).toContain('public')
  })

  it('user 范围附加 Vary: Cookie（合并已有 Vary，不覆盖 CORS 的 Vary: Origin）', () => {
    const res = NextResponse.json({ ok: true })
    res.headers.set('Vary', 'Origin')
    applyCacheControl(res, 'user', true)
    const vary = res.headers.get('vary') || ''
    expect(vary).toContain('Origin')
    expect(vary).toContain('Cookie')
  })

  it('private 范围不附加 Vary', () => {
    const res = NextResponse.json({ ok: true })
    applyCacheControl(res, 'private', true)
    expect(res.headers.get('vary')).toBeNull()
  })
})
