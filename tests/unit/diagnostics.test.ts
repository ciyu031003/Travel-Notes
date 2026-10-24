import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 客户端错误上报器（P-07 后半）纯逻辑：
 *  · 任意 throw 值规整（describeThrown）；
 *  · 同 message 每会话去重 + 会话上限（reportClientError，mock fetch 观测）。
 * 模块级状态（seenMessages/sentCount）→ 用 vi.resetModules 隔离用例。
 */
describe('diagnostics client reporter', () => {
  let mod: typeof import('@/lib/client/diagnostics')

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))))
    // node 环境无 navigator：sendBeacon 分支自然跳过，走 fetch（可观测）
    mod = await import('@/lib/client/diagnostics')
  })

  it('describeThrown：Error / 字符串 / 任意值 / 循环引用都不炸', () => {
    const err = new Error('boom')
    expect(mod.describeThrown(err)).toMatchObject({ message: 'boom' })
    expect(mod.describeThrown('plain')).toEqual({ message: 'plain' })
    expect(mod.describeThrown(42)).toEqual({ message: '42' })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(mod.describeThrown(cyclic).message).toBeTruthy()
    expect(mod.describeThrown(null).message).toBeTruthy()
  })

  it('同一 message 每会话只报一次，不同 message 各报一次', () => {
    mod.reportClientError({ kind: 'js-error', message: 'same error' })
    mod.reportClientError({ kind: 'js-error', message: 'same error' })
    mod.reportClientError({ kind: 'unhandled-rejection', message: 'same error' }) // kind 不同 → 不同键
    mod.reportClientError({ kind: 'js-error', message: 'other error' })
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('会话上限 20 条：之后静默丢弃', () => {
    for (let i = 0; i < 25; i++) {
      mod.reportClientError({ kind: 'js-error', message: 'error-' + i })
    }
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledTimes(20)
  })

  it('超长 message/stack 截断到有界长度', () => {
    mod.reportClientError({
      kind: 'js-error',
      message: 'x'.repeat(2000),
      stack: 'y'.repeat(10000),
      url: 'z'.repeat(2000),
    })
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string) as Record<string, string>
    expect(body.message.length).toBeLessThanOrEqual(500)
    expect(body.stack.length).toBeLessThanOrEqual(4000)
    expect(body.url.length).toBeLessThanOrEqual(300)
  })
})
