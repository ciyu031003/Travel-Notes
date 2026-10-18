import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * P1-15 回归：travel / social 的多表写必须落在**同一个事务**里，且失败不再静默。
 *
 * 背景（评审 D-2）：createTravel 的三次写各自 await、后两步还套了 `.catch(() => {})`，
 * 于是「天」生成失败时用户得到一本 0 天的旅行而接口返回成功；
 * updateSocialPost 三表写失败则留下「feed 标题改了、详情还是旧标题」的长期不一致。
 *
 * 这里用「记录调用时的事务深度」的 mock 证明：
 *  ① 同一业务操作的所有写都发生在 $transaction 回调内（inTx === 1）；
 *  ② ensureTravelDays 失败会抛到调用方（真实 Prisma 会回滚，不会返回成功）；
 *  ③ 派生投影（TravelPost）失败只记日志、不阻断主操作；
 *  ④ 主表与三表更新失败时整体失败（不再吞错）。
 */

const { prismaMock, txState, on, reset } = vi.hoisted(() => {
  type Call = { model: string; op: string; inTx: number; args: any[] }
  const state = { inTx: 0, calls: [] as Call[] }
  const handlers = new Map<string, (...args: any[]) => unknown>()
  const on = (model: string, op: string, fn: (...args: any[]) => unknown) => {
    handlers.set(`${model}.${op}`, fn)
  }
  const reset = () => {
    state.inTx = 0
    state.calls.length = 0
    handlers.clear()
  }
  const model = (name: string, ops: string[]) => {
    const obj: Record<string, any> = {}
    for (const op of ops) {
      obj[op] = vi.fn(async (...args: any[]) => {
        state.calls.push({ model: name, op, inTx: state.inTx, args })
        const h = handlers.get(`${name}.${op}`)
        return h ? await h(...args) : undefined
      })
    }
    return obj
  }
  const prismaMock: any = {
    travel: model('travel', ['create', 'update', 'delete', 'findUnique', 'findFirst', 'findMany', 'count', 'aggregate']),
    travelDay: model('travelDay', ['count', 'createMany', 'findMany', 'update', 'aggregate', 'delete', 'deleteMany']),
    travelPost: model('travelPost', ['findUnique', 'update', 'create', 'deleteMany']),
    post: model('post', ['update', 'findUnique']),
    media: model('media', ['findUnique']),
    spaceMember: model('spaceMember', ['findFirst']),
    user: model('user', ['findUnique', 'findFirst']),
  }
  prismaMock.$transaction = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    state.inTx += 1
    try {
      return await fn(prismaMock)
    } finally {
      state.inTx -= 1
    }
  })
  return { prismaMock, txState: state, on, reset }
})

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { createTravel, deleteTravel, updateTravelInfo } from '@/lib/modules/travel/travel.service'
import { updateSocialPost } from '@/lib/modules/social/social.service'

/** 取某次调用的记录（找不到直接失败，避免"没调用也算通过"） */
function callOf(model: string, op: string) {
  const found = txState.calls.find((c) => c.model === model && c.op === op)
  if (!found) throw new Error(`未调用 ${model}.${op}`)
  return found
}

function callIndex(model: string, op: string) {
  const idx = txState.calls.findIndex((c) => c.model === model && c.op === op)
  if (idx < 0) throw new Error(`未调用 ${model}.${op}`)
  return idx
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // 清掉上一用例的调用记录（保留 mock 实现），否则 $transaction 的次数会跨用例累加
  vi.clearAllMocks()
  reset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('createTravel：Travel + TravelDay + TravelPost 同事务', () => {
  it('所有写都发生在同一个事务内，且先建旅行再建天', async () => {
    on('travel', 'create', () => ({ id: 42 }))
    // slug 唯一化在事务外（只读），后续 syncTravelPost 在事务内读同一行
    on('travel', 'findFirst', () => null)
    on('travel', 'findUnique', () => ({
      id: 42,
      spaceId: null,
      ownerId: 7,
      visibility: 'PUBLIC',
      isPublic: true,
      title: '南京之行',
      description: null,
      coverMediaId: null,
    }))
    on('travelPost', 'findUnique', () => null)
    on('travelPost', 'create', () => ({ id: 900 }))
    on('travelDay', 'count', () => 0)
    on('travelDay', 'createMany', () => ({ count: 3 }))

    const r = await createTravel({
      title: '南京之行',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      ownerId: 7,
      visibility: 'PUBLIC',
    })

    expect(r).toEqual({ id: 42, slug: '南京之行' })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)

    // 写操作全部在事务内
    const travelCreate = callOf('travel', 'create')
    const postCreate = callOf('travelPost', 'create')
    const daysCreate = callOf('travelDay', 'createMany')
    expect(travelCreate.inTx).toBe(1)
    expect(postCreate.inTx).toBe(1)
    expect(daysCreate.inTx).toBe(1)
    // 顺序：旅行 → 公开帖投影 → 天（否则 syncTravelPost 读不到新建的旅行）
    expect(callIndex('travel', 'create')).toBeLessThan(callIndex('travelPost', 'create'))
    expect(callIndex('travelPost', 'create')).toBeLessThan(callIndex('travelDay', 'createMany'))
    // slug 唯一化是事务外的只读检查，不该被卷进事务
    expect(callOf('travel', 'findFirst').inTx).toBe(0)
  })

  it('ensureTravelDays 抛错 → createTravel 整体失败（不返回"成功但 0 天"的半成品）', async () => {
    on('travel', 'create', () => ({ id: 43 }))
    on('travel', 'findFirst', () => null)
    on('travelDay', 'count', () => {
      throw new Error('days boom')
    })

    await expect(createTravel({ title: '大理 5 天' })).rejects.toThrow('days boom')
    // 事务回调把异常抛给调用方是 Prisma 回滚的前提条件；绝不能再吞成"创建成功"
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(txState.inTx).toBe(0)
  })

  it('TravelPost 同步失败只记日志，不阻断建旅行（派生投影可重算）', async () => {
    on('travel', 'create', () => ({ id: 44 }))
    on('travel', 'findFirst', () => null)
    on('travel', 'findUnique', () => {
      throw new Error('post sync boom')
    })
    on('travelDay', 'count', () => 0)
    on('travelDay', 'createMany', () => ({ count: 1 }))

    const r = await createTravel({ title: '苏州两日' })

    expect(r.id).toBe(44)
    expect(callOf('travelDay', 'createMany').inTx).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('TravelPost 同步失败'),
      expect.objectContaining({ travelId: 44 }),
    )
  })
})

describe('deleteTravel：公开帖清理与删除同事务', () => {
  it('先取消公开再删旅行，两步都在事务内', async () => {
    on('travelPost', 'deleteMany', () => ({ count: 1 }))
    on('travel', 'delete', () => ({ id: 5 }))

    await deleteTravel(5)

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(callOf('travelPost', 'deleteMany').inTx).toBe(1)
    expect(callOf('travel', 'delete').inTx).toBe(1)
    expect(callIndex('travelPost', 'deleteMany')).toBeLessThan(callIndex('travel', 'delete'))
  })

  it('旅行删除失败 → 事务抛错（不会出现"帖子删了、旅行还在"）', async () => {
    on('travelPost', 'deleteMany', () => ({ count: 1 }))
    on('travel', 'delete', () => {
      throw new Error('fk boom')
    })

    await expect(deleteTravel(6)).rejects.toThrow('fk boom')
    expect(txState.inTx).toBe(0)
  })
})

describe('updateTravelInfo：主表 + 公开帖 + 天日期对齐同事务', () => {
  const currentRow = { title: '旧名字', slug: '旧名字', startDate: null, endDate: null }

  it('日期对齐失败不阻断主表更新（保持原"同步失败不失败主操作"语义），但一定记日志', async () => {
    on('travel', 'findUnique', () => currentRow)
    on('travel', 'findFirst', () => null)
    on('travel', 'update', () => ({ id: 7 }))
    on('travelDay', 'findMany', () => {
      throw new Error('day boom')
    })

    const r = await updateTravelInfo(7, { title: '新名字', startDate: '2026-05-01' })

    expect(r).toEqual({ slug: '新名字', daysChanged: 0 })
    expect(callOf('travel', 'update').inTx).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('TravelDay 日期对齐失败'),
      expect.objectContaining({ travelId: 7 }),
    )
  })

  it('主表更新失败 → 整体抛错（用户可见失败），事务深度归零', async () => {
    on('travel', 'findUnique', () => currentRow)
    on('travel', 'findFirst', () => null)
    on('travel', 'update', () => {
      throw new Error('update boom')
    })

    await expect(updateTravelInfo(7, { location: '苏州' })).rejects.toThrow('update boom')
    expect(txState.inTx).toBe(0)
  })
})

describe('updateSocialPost：TravelPost / Post / Travel 三表同事务', () => {
  it('三表写在同一个事务内；任一失败整体失败（不再留下 feed 与详情不一致）', async () => {
    on('travelPost', 'findUnique', () => ({ id: 3, authorId: 7, postId: 11, travelId: 22 }))
    on('travelPost', 'update', () => ({ id: 3 }))
    on('post', 'update', () => ({ id: 11 }))
    on('travel', 'update', () => {
      throw new Error('travel boom')
    })

    await expect(updateSocialPost(3, 7, { title: '新标题' })).rejects.toThrow('travel boom')

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(callOf('travelPost', 'update').inTx).toBe(1)
    expect(callOf('post', 'update').inTx).toBe(1)
    expect(txState.inTx).toBe(0)
  })

  it('没有 postId/travelId 的孤立帖只更新自身，不无谓开写第三表', async () => {
    on('travelPost', 'findUnique', () => ({ id: 4, authorId: 7, postId: null, travelId: null }))
    on('travelPost', 'update', () => ({ id: 4 }))

    // 后续 getSocialPost 会查库；这里让它查不到，直接返回 null 即可（本用例只验证写路径）
    await updateSocialPost(4, 7, { title: '只有标题' }).catch(() => null)

    expect(callOf('travelPost', 'update').inTx).toBe(1)
    expect(txState.calls.some((c) => c.model === 'post' && c.op === 'update')).toBe(false)
    expect(txState.calls.some((c) => c.model === 'travel' && c.op === 'update')).toBe(false)
  })
})
