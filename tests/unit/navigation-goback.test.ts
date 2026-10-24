import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { goBackOrHome, trackNavigation } from '@/lib/navigation'
import { canGoBackInApp, __getStack, __resetStack } from '@/lib/navigation-stack'

/**
 * goBackOrHome 的深链兜底（2026-10-24 修复"深链返回弹跳"）。
 *
 * 场景：通知/分享深链打开详情页（栈里只有这一页）→ 点返回。
 * 旧实现用 push 去 fallback：浏览器历史与 navigation-stack 都变成两层，
 * 用户在 fallback 页按返回时 back() 弹回刚离开的详情页 —— 回不去也退不出。
 * 修复后兜底必须 replace + 把栈校正为单层。
 */
describe('goBackOrHome 深链兜底', () => {
  const makeRouter = () => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  })

  // vitest 全局环境是 node（无 window）；goBackOrHome 只用 typeof window 判定
  // 浏览器/壳环境，空对象即足以走到真实的栈判定分支。
  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = {}
    __resetStack()
  })
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('深链（栈深 1）：用 replace 去 fallback，绝不用 push', () => {
    const router = makeRouter()
    trackNavigation('/travel/abc') // 模拟深链落地
    expect(canGoBackInApp()).toBe(false)

    goBackOrHome(router, '/travel')

    expect(router.replace).toHaveBeenCalledWith('/travel')
    expect(router.push).not.toHaveBeenCalled()
    expect(router.back).not.toHaveBeenCalled()
    // 栈被校正为 [fallback]，后续 trackNavigation 的同路径 push 不叠加
    expect(__getStack()).toEqual(['/travel'])
  })

  it('replace 兜底后，fallback 页按返回继续安全退出而不是弹回详情', () => {
    const router = makeRouter()
    trackNavigation('/travel/abc')
    goBackOrHome(router, '/travel')
    // pathname 变化触发 LayoutContent 的 trackNavigation
    trackNavigation('/travel')

    expect(canGoBackInApp()).toBe(false)

    // 在 fallback 页再按一次返回：走 replace('/') 兜底，而不是 back() 弹回详情
    goBackOrHome(router, '/')
    expect(router.replace).toHaveBeenLastCalledWith('/')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('有应用内历史（栈深 >1）：back()，不受本修复影响', () => {
    const router = makeRouter()
    trackNavigation('/travel')
    trackNavigation('/travel/abc')
    expect(canGoBackInApp()).toBe(true)

    goBackOrHome(router, '/')

    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })
})
