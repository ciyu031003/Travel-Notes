import { describe, it, expect, vi, afterEach } from 'vitest'
import { circlePostHref, circleUserHref, resolveTravelStoryHref, travelDetailHref } from '@/lib/routes'

/**
 * 旅行圈跳转地址的单测（R2 + R3 修复）。
 *
 * 背景一：「多个入口各自写 '/circle/' + p.id」，只要 id 缺失就得到 `/circle/undefined`
 *   —— 用户看到"点进去没有内容"，而 URL 看起来完全合法，日志也抓不到。
 *
 * 背景二（真机反馈"旅行圈点击后直接跳到首页、没办法阅览"）：
 *   本地壳是 `output: 'export'` 静态站，动态段 `/circle/[postId]` **只会导出
 *   generateStaticParams 声明的路径**（目前仅 `/circle/0`）。点卡片去 `/circle/123`
 *   在静态站里取不到文件 → WebView 回落到首页。因此本地壳必须改用查询参数路由
 *   `/circle/detail?postId=…`（静态可导出），与 `/travel/detail?slug=…` 同一套解法。
 */

const OLD_PLATFORM = process.env.NEXT_PUBLIC_APP_PLATFORM

afterEach(() => {
  vi.resetModules()
  if (OLD_PLATFORM === undefined) delete process.env.NEXT_PUBLIC_APP_PLATFORM
  else process.env.NEXT_PUBLIC_APP_PLATFORM = OLD_PLATFORM
})

describe('circlePostHref · Web（真实动态路由）', () => {
  it('有效 id → /circle/<id>', () => {
    expect(circlePostHref(12)).toBe('/circle/12')
    expect(circlePostHref('12')).toBe('/circle/12')
  })

  it('缺失/非法 id → null（调用方据此不跳转，而不是跳 /circle/undefined）', () => {
    for (const bad of [null, undefined, '', 'abc', NaN, 0, -1, Infinity, {}, 0.5]) {
      expect(circlePostHref(bad as unknown as number), `输入 ${String(bad)}`).toBeNull()
    }
  })
})

describe('circlePostHref · 本地壳（静态导出，必须走查询参数）', () => {
  it('返回 /circle/detail?postId=<id>，而不是静态站里不存在的 /circle/<id>', async () => {
    process.env.NEXT_PUBLIC_APP_PLATFORM = 'mobile'
    vi.resetModules()
    const mod = await import('@/lib/routes')
    expect(mod.circlePostHref(123)).toBe('/circle/detail?postId=123')
  })

  it('用户主页返回 /circle/user-detail?id=<id>', async () => {
    process.env.NEXT_PUBLIC_APP_PLATFORM = 'mobile'
    vi.resetModules()
    const mod = await import('@/lib/routes')
    expect(mod.circleUserHref(45)).toBe('/circle/user-detail?id=45')
  })

  it('旅行详情同样已走查询参数（历史修复，防回归）', async () => {
    process.env.NEXT_PUBLIC_APP_PLATFORM = 'mobile'
    vi.resetModules()
    const mod = await import('@/lib/routes')
    expect(mod.travelDetailHref('dali-3')).toBe('/travel/detail?slug=dali-3')
  })
})

describe('resolveTravelStoryHref', () => {
  it('有 postId 优先用帖子详情（这才是"别人的旅行"的阅读页）', () => {
    expect(resolveTravelStoryHref({ postId: 7, slug: 'dali' })).toBe('/circle/7')
  })

  it('没有 postId 但有 slug → 退回旅行详情（宁可看到自己的记录页，也不跳空页面）', () => {
    expect(resolveTravelStoryHref({ postId: null, slug: 'dali' })).toBe(travelDetailHref('dali'))
    expect(resolveTravelStoryHref({ slug: 'dali' })).toBe(travelDetailHref('dali'))
  })

  it('两者都没有 → null（调用方不跳转）', () => {
    expect(resolveTravelStoryHref({})).toBeNull()
    expect(resolveTravelStoryHref({ postId: undefined, slug: null })).toBeNull()
    expect(resolveTravelStoryHref({ postId: '', slug: '' })).toBeNull()
  })

  it('slug 会被 URL 编码（中文标题的 slug 是常态）', () => {
    const href = resolveTravelStoryHref({ slug: '大理 3 日' })
    expect(href).not.toBeNull()
    expect(href).not.toContain(' ')
    expect(href!.startsWith('/travel/')).toBe(true)
  })
})
