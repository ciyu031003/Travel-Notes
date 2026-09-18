import { describe, it, expect } from 'vitest'
import { circlePostHref, resolveTravelStoryHref, travelDetailHref } from '@/lib/routes'

/**
 * 旅行圈跳转地址的单测（R2 路由加固）。
 *
 * 背景：多个入口原先各自写 `'/circle/' + p.id`。只要 `id` 缺失
 * （接口少字段、离线缓存旧结构、后台表格里关联对象为空），就得到 `/circle/undefined`
 * —— 用户看到"点进去没有内容"，而 URL 看起来完全合法，日志里也抓不到。
 * 现在统一走 `circlePostHref` / `resolveTravelStoryHref`。
 */

describe('circlePostHref', () => {
  it('有效 id → /circle/<id>', () => {
    expect(circlePostHref(12)).toBe('/circle/12')
    expect(circlePostHref('12')).toBe('/circle/12')
    expect(circlePostHref(0.5)).toBeNull() // 非整数主键不接受
  })

  it('缺失/非法 id → null（调用方据此不跳转，而不是跳 /circle/undefined）', () => {
    for (const bad of [null, undefined, '', 'abc', NaN, 0, -1, Infinity, {}]) {
      expect(circlePostHref(bad as unknown as number), `输入 ${String(bad)}`).toBeNull()
    }
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
