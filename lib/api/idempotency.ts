/**
 * 服务端幂等（B4）—— 消费客户端 Idempotency-Key。
 *
 * 背景：离线队列在弱网下会重放写操作（超时但服务端其实已成功 → 重试），
 * 客户端已在 sync-queue 入队时生成 `__clientMutationId` 并用 `Idempotency-Key` 头带出
 * （见 lib/modules/offline/sync-dispatcher.ts）。服务端此前完全不消费该头，
 * 于是"响应丢失 + 重试"会重复创建（两本同名旅行 / 两条同样回忆）。
 *
 * 本模块把「首键执行一次、后续同键返回首次主键」收口为一处：
 *   - ClientMutation 表以幂等键为主键做去重（DB 唯一约束兜并发）；
 *   - 命中已有 entityId → 直接返回（replayed=true，调用方不要再执行创建）；
 *   - 未命中 → 执行创建并记录 entityId；创建失败则删除占位，允许客户端重试。
 *
 * 约束：幂等是**增强**而不是前置校验 —— 缺头/非法头按"无幂等键"处理，
 * 绝不能因为客户端没带键而拒绝一次正常创建（老版本 App 仍要能写）。
 */
import { prisma } from '@/lib/db'

/** 幂等键：UUID 或同类客户端 id（可含 . _ : -），长度 8..128 */
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

/** 同键并发时等待先到请求写回 entityId 的上限（超过视为该请求崩溃，自己接手执行） */
const WAIT_TOTAL_MS = 1500
const WAIT_STEP_MS = 100

/** 读 Idempotency-Key 头：缺失或格式非法 → null（按无幂等处理） */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get('idempotency-key')
  if (!raw) return null
  const key = raw.trim()
  return KEY_RE.test(key) ? key : null
}

export interface IdempotentRunResult<T> {
  entityId: number
  /** 首次创建时的返回值（重放时拿不到，调用方需自行补齐响应所需字段） */
  value: T
}

export interface IdempotentResult<T> {
  entityId: number | null
  value?: T
  /** true = 命中已有记录，本次没有执行创建 */
  replayed: boolean
}

async function findMutation(key: string) {
  try {
    return await prisma.clientMutation.findUnique({ where: { id: key } })
  } catch {
    // 幂等表不可用（迁移未执行/DB 异常）不能阻断创建：按"未命中"继续
    return null
  }
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P2002'
}

async function waitForEntityId(key: string): Promise<number | null> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < WAIT_TOTAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
    const row = await findMutation(key)
    if (row?.entityId != null) return row.entityId
  }
  return null
}

export async function withIdempotency<T>(options: {
  key: string | null
  userId?: number | null
  entityType: string
  run: () => Promise<IdempotentRunResult<T>>
}): Promise<IdempotentResult<T>> {
  const { key, userId, entityType, run } = options

  if (!key) {
    const result = await run()
    return { entityId: result.entityId, value: result.value, replayed: false }
  }

  const existing = await findMutation(key)
  if (existing?.entityId != null) {
    return { entityId: existing.entityId, replayed: true }
  }

  let reserved = false
  if (!existing) {
    try {
      await prisma.clientMutation.create({
        data: { id: key, userId: userId ?? null, entityType },
      })
      reserved = true
    } catch (error) {
      if (!isUniqueViolation(error)) {
        /**
         * 幂等表不可用（迁移未执行 / DB 异常）：**降级为无幂等执行**。
         * 幂等是增强，绝不能因为 ClientMutation 表缺失导致所有创建失败
         * （灰度发布顺序：先上代码后跑迁移的窗口必须仍能写）。
         */
        console.error(
          '[idempotency] 幂等表不可用，降级为无幂等执行（不影响本次创建）:',
          (error as Error)?.message || error,
        )
        const result = await run()
        return { entityId: result.entityId, value: result.value, replayed: false }
      }
      // 唯一键冲突 = 并发请求已占位：不是错误，转为等待其结果
    }
  }

  if (!reserved) {
    const filled = await waitForEntityId(key)
    if (filled != null) return { entityId: filled, replayed: true }
    // 占位请求已崩溃（entityId 一直为空）：自己接手执行，避免客户端永久 409/等待
  }

  try {
    const result = await run()
    await prisma.clientMutation
      .update({ where: { id: key }, data: { entityId: result.entityId } })
      .catch((error) => {
        // 创建已成功；记录失败只影响后续重放的去重能力，不阻断响应
        console.error('[idempotency] 写入 entityId 失败（不阻断已成功的创建）:', (error as Error)?.message || error)
      })
    return { entityId: result.entityId, value: result.value, replayed: false }
  } catch (error) {
    if (reserved) {
      // 创建失败：释放占位，让客户端重试时能重新执行（否则要等 1.5s 才重跑）
      await prisma.clientMutation.delete({ where: { id: key } }).catch(() => {})
    }
    throw error
  }
}
