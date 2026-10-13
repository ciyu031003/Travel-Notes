import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 花销绑定行程（2026-10-13）
 *
 * 需求：记一笔花销时可以「选定行程」（如 11/1 高铁 北京→上海），
 * 选定后该费用要同时出现在行程与总览里。
 *
 * 这里钉住服务端的**归属校验**：只信前端传来的 itineraryItemId 会把花销挂到
 * 别人的行程上，所以 addExpense 必须确认该行程属于本旅行，
 * 不属于（或已删除）时退化为「不绑定」而不是报错 —— 行程刚被删不该导致记不了账。
 */

const { prismaMock } = vi.hoisted(() => {
  const state: { created: any[] } = { created: [] }
  return {
    prismaMock: {
      itineraryItem: { findUnique: vi.fn() },
      expense: {
        create: vi.fn(async (args: any) => {
          state.created.push(args)
          return { id: 1 }
        }),
      },
      __state: state,
    },
  }
})

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { addExpense } from '@/lib/modules/travel/travel.service'

beforeEach(() => {
  prismaMock.__state.created.length = 0
  prismaMock.itineraryItem.findUnique.mockReset()
})

describe('addExpense · 行程绑定归属校验', () => {
  it('行程属于本旅行 → 正常绑定', async () => {
    prismaMock.itineraryItem.findUnique.mockResolvedValue({ travelDay: { travelId: 7 } })
    await addExpense(7, { amount: 128, itineraryItemId: 55 })
    expect(prismaMock.__state.created[0].data.itineraryItemId).toBe(55)
  })

  it('行程属于**别的**旅行 → 退化为不绑定（不能挂到别人行程上）', async () => {
    prismaMock.itineraryItem.findUnique.mockResolvedValue({ travelDay: { travelId: 999 } })
    await addExpense(7, { amount: 50, itineraryItemId: 55 })
    expect(prismaMock.__state.created[0].data.itineraryItemId).toBeNull()
  })

  it('行程不存在（已删除）→ 退化为不绑定，且不抛错（账还是要记上）', async () => {
    prismaMock.itineraryItem.findUnique.mockResolvedValue(null)
    await addExpense(7, { amount: 50, itineraryItemId: 55 })
    expect(prismaMock.__state.created[0].data.itineraryItemId).toBeNull()
  })

  it('查询行程时出错 → 同样退化为不绑定（不因校验失败丢账）', async () => {
    prismaMock.itineraryItem.findUnique.mockRejectedValue(new Error('db down'))
    await addExpense(7, { amount: 50, itineraryItemId: 55 })
    expect(prismaMock.__state.created[0].data.itineraryItemId).toBeNull()
  })

  it('未传行程 → 不绑定，且不做多余查询', async () => {
    await addExpense(7, { amount: 50 })
    expect(prismaMock.__state.created[0].data.itineraryItemId).toBeNull()
    expect(prismaMock.itineraryItem.findUnique).not.toHaveBeenCalled()
  })

  it('金额按分存储（整数分不丢精度）', async () => {
    await addExpense(7, { amount: 0.1 })
    expect(prismaMock.__state.created[0].data.amountCents).toBe(10)
  })
})
