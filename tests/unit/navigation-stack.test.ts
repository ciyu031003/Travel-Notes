import { describe, it, expect, beforeEach } from 'vitest'
import {
  canGoBackInApp,
  recordPop,
  recordPush,
  __getStack,
  __resetStack,
} from '@/lib/navigation-stack'

/**
 * 应用内导航栈（2026-10-12）
 *
 * 背景：侧滑返回此前用 `window.history.length > 1` 判断"有无上一页"，
 * 而 Capacitor WebView 里该值恒 > 1 —— 于是左滑 `router.back()` 退到 WebView
 * 空白历史项，**真机表现为直接退出 App 回到手机桌面**。
 * 这里守护的就是替代方案的核心不变量。
 */
describe('navigation-stack', () => {
  beforeEach(() => __resetStack())

  it('空栈时不允许后退（防止 back() 退出应用）', () => {
    expect(canGoBackInApp()).toBe(false)
    recordPush('/')
    expect(canGoBackInApp()).toBe(false)
  })

  it('前进后允许后退', () => {
    recordPush('/me')
    recordPush('/me/favorites')
    expect(canGoBackInApp()).toBe(true)
    expect(__getStack()).toEqual(['/me', '/me/favorites'])
  })

  it('返回上一层时 pop，且深度回落', () => {
    recordPush('/me')
    recordPush('/me/favorites')
    // pathname 变回 /me → 应识别为 pop
    expect(recordPop('/me')).toBe(true)
    expect(__getStack()).toEqual(['/me'])
    expect(canGoBackInApp()).toBe(false)
  })

  it('不是来路的路径按前进处理（不被误判为返回）', () => {
    recordPush('/me')
    recordPush('/me/favorites')
    // 跳到收藏里的某条帖子（新页面），不是"上一层"
    expect(recordPop('/circle/123')).toBe(false)
    recordPush('/circle/123')
    expect(__getStack()).toEqual(['/me', '/me/favorites', '/circle/123'])
  })

  it('查询串与结尾斜杠不影响判定', () => {
    recordPush('/me')
    recordPush('/circle/9')
    expect(recordPop('/me/?tab=1')).toBe(true)
    expect(__getStack()).toEqual(['/me'])
  })

  it('重复 push 同一路径不叠加深度（replace/刷新不产生假历史）', () => {
    recordPush('/travel')
    recordPush('/travel')
    recordPush('/travel')
    expect(__getStack()).toEqual(['/travel'])
    expect(canGoBackInApp()).toBe(false)
  })

  it('深度上限保护，不会无限增长', () => {
    recordPush('/')
    for (let i = 0; i < 80; i++) recordPush('/p' + i)
    expect(__getStack().length).toBeLessThanOrEqual(50)
  })
})
