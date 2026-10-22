import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * P3-36：lib/prisma-adapter.ts（手写 Prisma driver adapter，530 行）此前 0 覆盖。
 * 全部 mock mysql2 连接池，**不连任何数据库**：
 *  - 连接/重试/健康检查定时器/重连/关闭
 *  - SQL 参数转换、行与列类型映射、executeRaw 影响行数/lastInsertId
 *  - 事务包装（commit/rollback/savepoint/dispose）
 */

vi.hoisted(() => {
  // DB_CONFIG 在模块顶层读取 env —— 必须在 import 前设置（重试快、健康检查间隔短）
  process.env.DB_RETRY_MAX_ATTEMPTS = '2'
  process.env.DB_RETRY_INITIAL_DELAY = '1'
  process.env.DB_HEALTH_CHECK_INTERVAL = '1000'
})

const { createPoolMock } = vi.hoisted(() => ({ createPoolMock: vi.fn() }))
vi.mock('mysql2/promise', () => ({ createPool: createPoolMock }))

import { PrismaMariaDB } from '@/lib/prisma-adapter'

const URL = 'mysql://user:pass@127.0.0.1:3306/travel_notes'

interface FakeConn {
  ping: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  beginTransaction: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  rollback: ReturnType<typeof vi.fn>
}

function fakeConn(overrides: Partial<FakeConn> = {}): FakeConn {
  return {
    ping: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn().mockResolvedValue([[], []]),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function fakePool(opts: { conn?: FakeConn; on?: ReturnType<typeof vi.fn> } = {}) {
  const conn = opts.conn ?? fakeConn()
  return {
    getConnection: vi.fn().mockResolvedValue(conn),
    end: vi.fn().mockResolvedValue(undefined),
    on: opts.on ?? vi.fn(),
    execute: vi.fn().mockResolvedValue([[], []]),
    totalConnections: 3,
    activeConnections: 1,
    idleConnections: 2,
    pendingConnections: 0,
    __conn: conn,
  }
}

function fields(...specs: Array<{ name: string; type: number; flags?: number; length?: number }>) {
  return specs.map((s) => ({ name: s.name, type: s.type, flags: s.flags ?? 0, length: s.length }))
}

let adapter: PrismaMariaDB

beforeEach(() => {
  vi.clearAllMocks()
  adapter = new PrismaMariaDB({ url: URL })
})

afterEach(async () => {
  // 清掉可能存在的健康检查定时器
  await adapter.dispose().catch(() => {})
  vi.useRealTimers()
})

describe('连接与生命周期', () => {
  it('构造期不再注册进程信号（P2-35：信号处理交给 instrumentation）', () => {
    const before = process.listenerCount('SIGTERM')
    new PrismaMariaDB({ url: URL })
    expect(process.listenerCount('SIGTERM')).toBe(before)
  })

  it('connect 成功：建池、ping、注册 enqueue 告警，返回 provider 正确的 adapter', async () => {
    const pool = fakePool()
    createPoolMock.mockReturnValue(pool)

    const a = await adapter.connect()
    expect(createPoolMock).toHaveBeenCalledTimes(1)
    expect(pool.on).toHaveBeenCalledWith('enqueue', expect.any(Function))
    expect(a.provider).toBe('mysql')
    expect(a.adapterName).toBe('@prisma/adapter-mariadb')
    expect(a.getConnectionInfo?.()).toEqual({ schemaName: 'travel_notes', supportsRelationJoins: true })
  })

  it('连接打不开时按 DB_RETRY_MAX_ATTEMPTS 重试后抛错', async () => {
    const failingPool = fakePool({ conn: fakeConn({ ping: vi.fn().mockRejectedValue(new Error('refused')) }) })
    createPoolMock.mockReturnValue(failingPool)

    await expect(adapter.connect()).rejects.toThrow(/Failed to connect to database after 2 attempts/)
    expect(createPoolMock).toHaveBeenCalledTimes(2)
  })

  it('已有池 ping 失败 → reconnect 后重新建池', async () => {
    const badConn = fakeConn({ ping: vi.fn().mockRejectedValueOnce(new Error('stale')) })
    const badPool = fakePool({ conn: badConn })
    const goodPool = fakePool()
    createPoolMock.mockReturnValueOnce(badPool).mockReturnValue(goodPool)

    await adapter.connect()
    expect(badPool.end).toHaveBeenCalled()
    expect(createPoolMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('dispose 关闭连接池并停止健康检查；重复 dispose 安全', async () => {
    const pool = fakePool()
    createPoolMock.mockReturnValue(pool)
    await adapter.connect()
    await adapter.dispose()
    expect(pool.end).toHaveBeenCalledTimes(1)
    await adapter.dispose()
    expect(pool.end).toHaveBeenCalledTimes(1)
  })

  it('close 可重复调用且只关一次（P2-35 优雅停机入口）', async () => {
    const pool = fakePool()
    createPoolMock.mockReturnValue(pool)
    await adapter.connect()
    await adapter.close()
    await adapter.close()
    expect(pool.end).toHaveBeenCalledTimes(1)
  })

  it('getPoolStatus：有池返回连接数，无池返回 null', async () => {
    expect(adapter.getPoolStatus()).toBeNull()
    const pool = fakePool()
    createPoolMock.mockReturnValue(pool)
    await adapter.connect()
    expect(adapter.getPoolStatus()).toEqual({
      totalConnections: 3,
      activeConnections: 1,
      idleConnections: 2,
      waitingRequests: 0,
    })
  })
})

describe('健康检查与重连', () => {
  it('健康检查 ping 失败会触发重连（重新建池）', async () => {
    vi.useFakeTimers()
    const badConn = fakeConn({ ping: vi.fn().mockRejectedValue(new Error('down')) })
    const pool = fakePool({ conn: badConn })
    createPoolMock.mockReturnValue(fakePool())
    await adapter.connect()

    // 手动启动健康检查（指向失败池）：把内部 pool 替换成失败的池
    ;(adapter as any).pool = pool
    ;(adapter as any).startHealthCheck()
    const before = createPoolMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(createPoolMock.mock.calls.length).toBeGreaterThan(before)
  })

  it('reconnect：关闭旧池并新建；关闭中直接返回；失败只记日志不抛', async () => {
    const oldPool = fakePool()
    ;(adapter as any).pool = oldPool
    createPoolMock.mockReturnValue(fakePool())
    await (adapter as any).reconnect()
    expect(oldPool.end).toHaveBeenCalled()

    // isShuttingDown 时不再重连
    ;(adapter as any).isShuttingDown = true
    const calls = createPoolMock.mock.calls.length
    await (adapter as any).reconnect()
    expect(createPoolMock.mock.calls.length).toBe(calls)

    // 新池连接失败 → 仅 console.error，不抛出
    ;(adapter as any).isShuttingDown = false
    createPoolMock.mockReturnValue(fakePool({ conn: fakeConn({ ping: vi.fn().mockRejectedValue(new Error('boom')) }) }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect((adapter as any).reconnect()).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('SQL 执行与结果映射', () => {
  async function connected(pool: ReturnType<typeof fakePool>) {
    createPoolMock.mockReturnValue(pool)
    return adapter.connect()
  }

  it('queryRaw：参数转换（Date/ISO 字符串）+ 行列类型映射 + Buffer/Date/bigint/null', async () => {
    const pool = fakePool()
    const date = new Date('2026-10-22T01:02:03.456Z')
    pool.execute.mockResolvedValue([
      [
        {
          i: 1,
          f: 1.5,
          s: 'x',
          d: date,
          b: Buffer.from('ab'),
          big: BigInt(5),
          nul: null,
          und: undefined,
          flag: 1,
        },
      ],
      fields(
        { name: 'i', type: 3 },
        { name: 'f', type: 4 },
        { name: 's', type: 253 },
        { name: 'd', type: 12 },
        { name: 'b', type: 252, flags: 0x80 },
        { name: 'big', type: 8 },
        { name: 'nul', type: 253 },
        { name: 'und', type: 253 },
        { name: 'flag', type: 1, length: 1 },
      ),
    ])
    const a = await connected(pool)

    const res = await a.queryRaw({
      sql: 'select * from t where a = ? and b = ? and c = ?',
      args: [date, '2026-01-01T10:00:00Z', 'plain'],
      argTypes: [],
    } as any)

    // 参数：Date/ISO 字符串 → MySQL DATETIME 文本；普通字符串原样
    const sentArgs = pool.execute.mock.calls[0][1] as unknown[]
    expect(String(sentArgs[0])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
    expect(String(sentArgs[1])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
    expect(sentArgs[2]).toBe('plain')

    expect(res.columnNames).toEqual(['i', 'f', 's', 'd', 'b', 'big', 'nul', 'und', 'flag'])
    // 类型码映射：int32/float/text/datetime/bytes/int64/boolean
    expect(res.columnTypes).toEqual([0, 2, 7, 10, 13, 1, 7, 7, 5])
    expect(res.rows[0][0]).toBe(1)
    expect(res.rows[0][1]).toBe(1.5)
    expect(res.rows[0][2]).toBe('x')
    expect(res.rows[0][3]).toBeInstanceOf(Date)
    expect(Buffer.isBuffer(res.rows[0][4])).toBe(true)
    expect(res.rows[0][5]).toBe('5') // bigint → string
    expect(res.rows[0][6]).toBeNull()
    expect(res.rows[0][7]).toBeNull()
    expect(res.rows[0][8]).toBe(1)
  })

  it('queryRaw：非 SELECT 结果（ResultSetHeader）→ rows=[] + lastInsertId', async () => {
    const pool = fakePool()
    pool.execute.mockResolvedValue([{ insertId: 42, affectedRows: 1 }, undefined])
    const a = await connected(pool)
    const res = await a.queryRaw({ sql: 'insert into t values (?)', args: [], argTypes: [] } as any)
    expect(res.rows).toEqual([])
    expect(res.columnNames).toEqual([])
    expect(res.lastInsertId).toBe('42')
  })

  it('executeRaw：返回 affectedRows；数组结果返回行数', async () => {
    const pool = fakePool()
    const a = await connected(pool)
    pool.execute.mockResolvedValueOnce([{ affectedRows: 3 }, undefined])
    await expect(a.executeRaw({ sql: 'update t set x=1', args: [], argTypes: [] } as any)).resolves.toBe(3)
    pool.execute.mockResolvedValueOnce([[{ a: 1 }, { a: 2 }], fields({ name: 'a', type: 3 })])
    await expect(a.executeRaw({ sql: 'select 1', args: [], argTypes: [] } as any)).resolves.toBe(2)
  })

  it('executeScript：按分号逐句执行，忽略空白语句', async () => {
    const pool = fakePool()
    const a = await connected(pool)
    await a.executeScript('select 1; ; select 2;')
    expect(pool.execute).toHaveBeenCalledTimes(2)
  })

  it('列类型映射覆盖所有 MySQL 类型族（含未知类型回退 Text）', async () => {
    const pool = fakePool()
    const a = await connected(pool)
    const types = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 999]
    pool.execute.mockResolvedValue([[], fields(...types.map((t, i) => ({ name: 'c' + i, type: t, flags: 0, length: 10 })))])
    const res = await a.queryRaw({ sql: 'select 1', args: [], argTypes: [] } as any)
    expect(res.columnTypes).toEqual([
      4, 0, 0, 0, 2, 3, 7, 10, 1, 0, 8, 9, 10, 0, 7, 5, 11, 4, 12, 14, 7, 7, 7, 7, 7, 7, 7, 7,
    ])
  })

  it('processArgs：普通字符串/数字/Buffer 原样透传', async () => {
    const pool = fakePool()
    const a = await connected(pool)
    await a.queryRaw({ sql: 'select ?', args: ['s', 1, null, Buffer.from('b')], argTypes: [] } as any)
    const sent = pool.execute.mock.calls[0][1] as unknown[]
    expect(sent[0]).toBe('s')
    expect(sent[1]).toBe(1)
    expect(sent[2]).toBeNull()
    expect(Buffer.isBuffer(sent[3])).toBe(true)
  })
})

describe('事务包装', () => {
  it('startTransaction：设置隔离级别 + beginTransaction；commit 后 release', async () => {
    const conn = fakeConn()
    const pool = fakePool({ conn })
    createPoolMock.mockReturnValue(pool)
    const a = await adapter.connect()

    const tx = await a.startTransaction('SERIALIZABLE')
    expect(conn.execute).toHaveBeenCalledWith('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    expect(conn.beginTransaction).toHaveBeenCalled()
    expect(tx.options.usePhantomQuery).toBe(false)

    conn.execute.mockResolvedValueOnce([[{ x: 1 }], fields({ name: 'x', type: 3 })])
    const res = await tx.queryRaw({ sql: 'select 1', args: [], argTypes: [] } as any)
    expect(res.rows[0][0]).toBe(1)

    conn.execute.mockResolvedValueOnce([{ affectedRows: 1 }, undefined])
    await expect(tx.executeRaw({ sql: 'update t', args: [], argTypes: [] } as any)).resolves.toBe(1)

    await tx.executeScript('select 1; select 2;')
    expect(conn.execute).toHaveBeenCalledTimes(5)

    await tx.commit()
    expect(conn.commit).toHaveBeenCalled()
    expect(conn.release).toHaveBeenCalled()
  })

  it('rollback / savepoint / dispose 与嵌套事务拒绝', async () => {
    const conn = fakeConn()
    const pool = fakePool({ conn })
    createPoolMock.mockReturnValue(pool)
    const a = await adapter.connect()
    // connect 自己 ping 后 release 过一次，先清掉计数，只统计事务释放
    conn.release.mockClear()
    const tx = await a.startTransaction()

    await tx.createSavepoint?.('sp1')
    expect(conn.execute).toHaveBeenCalledWith('SAVEPOINT sp1')
    await tx.rollbackToSavepoint?.('sp1')
    expect(conn.execute).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT sp1')
    await tx.releaseSavepoint?.('sp1')
    expect(conn.execute).toHaveBeenCalledWith('RELEASE SAVEPOINT sp1')

    await expect(tx.startTransaction()).rejects.toThrow('Nested transactions not supported')

    await tx.dispose()
    expect(conn.release).toHaveBeenCalledTimes(1)

    await tx.rollback()
    expect(conn.rollback).toHaveBeenCalled()
    // dispose 释放一次 + rollback 释放一次
    expect(conn.release).toHaveBeenCalledTimes(2)
  })

  it('startTransaction 的不同隔离级别映射', async () => {
    const conn = fakeConn()
    const pool = fakePool({ conn })
    createPoolMock.mockReturnValue(pool)
    const a = await adapter.connect()
    await a.startTransaction('READ COMMITTED')
    expect(conn.execute).toHaveBeenCalledWith('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
    await a.startTransaction('SNAPSHOT')
    expect(conn.execute).toHaveBeenCalledWith('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    await a.startTransaction()
    expect(conn.execute).toHaveBeenCalledTimes(2)
  })
})
