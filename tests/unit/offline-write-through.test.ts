/**
 * 离线写统一策略（writeThrough）回归。
 *
 * 锁的是"写完看不见"这一类真机问题：原生壳此前**在线也只写本地 + 入队**，
 * 而页面读的是服务端，于是
 *   · 新建旅行 → 详情进不去
 *   · 加一天行程 / 记一笔 → 返回详情就没了
 *   · 编辑旅行信息 → 本地缓存缺失时直接失败（哪怕在线）
 * 统一契约：本地先写（失败不阻断）→ 在线直写服务端 → 服务端失败才降级待同步 →
 * 两边都失败必须明确报错。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { nativeRef } = vi.hoisted(() => ({ nativeRef: { value: true } }))
vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => nativeRef.value }))

import { writeThrough } from '@/lib/modules/offline/write-through'

beforeEach(() => {
  nativeRef.value = true
  vi.restoreAllMocks()
})

describe('writeThrough', () => {
  it('本地 + 服务端都成功 → 以服务端为准，并回调标记已同步', async () => {
    const local = vi.fn(async () => {})
    const onServerOk = vi.fn(async () => {})
    const r = await writeThrough<number>({
      localWrite: local,
      serverWrite: async () => ({ ok: true, data: 99 }),
      onServerOk,
    })
    expect(r.mode).toBe('server')
    expect(r.data).toBe(99)
    expect(local).toHaveBeenCalled()
    expect(onServerOk).toHaveBeenCalledWith(99)
  })

  it('**本地写失败也必须走服务端成功**（真机故障就是卡在这里）', async () => {
    const r = await writeThrough<number>({
      localWrite: async () => {
        throw new Error('no such column: slug')
      },
      serverWrite: async () => ({ ok: true, data: 7 }),
    })
    expect(r.mode).toBe('server')
    expect(r.data).toBe(7)
  })

  it('服务端失败但本地成功 → 降级为待同步（离线可用）', async () => {
    const r = await writeThrough({
      localWrite: async () => {},
      serverWrite: async () => ({ ok: false, error: '网络不可用' }),
    })
    expect(r.mode).toBe('local')
    expect(r.error).toBeUndefined()
  })

  it('两边都失败 → failed 且带原因（不假装成功）', async () => {
    const r = await writeThrough({
      localWrite: async () => {
        throw new Error('db locked')
      },
      serverWrite: async () => ({ ok: false, error: '网络不可用' }),
    })
    expect(r.mode).toBe('failed')
    expect(r.error).toBe('网络不可用')
  })

  it('只有本地写（无在线路径）时：本地成功即 local', async () => {
    const r = await writeThrough({ localWrite: async () => {} })
    expect(r.mode).toBe('local')
  })

  it('Web（非原生）不写本地，直接服务端', async () => {
    nativeRef.value = false
    const local = vi.fn(async () => {})
    const r = await writeThrough<number>({
      localWrite: local,
      serverWrite: async () => ({ ok: true, data: 1 }),
    })
    expect(r.mode).toBe('server')
    expect(local).not.toHaveBeenCalled()
  })

  it('onServerOk 抛错不影响写入结果', async () => {
    const r = await writeThrough<number>({
      serverWrite: async () => ({ ok: true, data: 5 }),
      onServerOk: () => {
        throw new Error('mark failed')
      },
    })
    expect(r.mode).toBe('server')
    expect(r.data).toBe(5)
  })
})
