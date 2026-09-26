/**
 * 离线写的统一策略：**本地乐观写 + 在线直写服务端**（write-through）。
 *
 * 为什么必须收敛成一个helper：原先每个写路径（旅行 / 行程天 / 回忆 / 相册 / 碎碎念）
 * 都各写一遍「原生壳就只写本地 + 入队」，于是**在线时也不上传**，全靠 SyncEngine 在
 * 「App 启动 / 网络变化」时才回放。后果是用户刚写的内容在页面上看不到：
 *   · 新建旅行 → 详情页找不到（真机连续几版报"进不去"）
 *   · 加一天行程 / 记一笔 → 页面读的是**服务端**时间线，于是"加完返回就没了"
 * 这类"写完看不见"的根因是同一个：把本地队列当成了唯一真相。
 *
 * 现在的契约：
 *   ① 本地先写（失败不阻断，离线时仍要能用）；
 *   ② **在线就把服务端写也做掉**，成功即以服务端结果为准（拿到真正的云端 id）；
 *   ③ 服务端失败但本地成功 → 标记为「待同步」，由 SyncEngine 补传；
 *   ④ 两边都失败 → 明确报错，不许假装成功。
 */
import { isNativePlatform } from './platform'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'

export interface ServerWriteOutcome<T> {
  ok: boolean
  error?: string
  data?: T
}

export type WriteThroughMode = 'server' | 'local' | 'failed'

export interface WriteThroughResult<T> {
  mode: WriteThroughMode
  /** 服务端成功时的返回数据（含云端 id） */
  data?: T
  /** 失败原因（仅 mode='failed' 有值） */
  error?: string
}

function msgOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e || '未知错误')
}

/**
 * @param entityId    本地实体 id（`writeLocalEntity` 用的同一个）。**在线成功后据此清队列**，
 *                    否则队列里的同一项会被 SyncEngine 再上传一次 → 重复数据。
 * @param localWrite  本地乐观写（仅原生端执行；Web 端跳过）
 * @param serverWrite 服务端写（在线时执行；不传表示该实体没有在线写路径）
 * @param onServerOk  服务端成功后回调（用于把本地行标记为已同步）
 */
export async function writeThrough<T>(args: {
  entityId?: string | null
  localWrite?: () => Promise<void>
  serverWrite?: () => Promise<ServerWriteOutcome<T>>
  onServerOk?: (data: T | undefined) => Promise<void> | void
}): Promise<WriteThroughResult<T>> {
  let localOk = false
  let localErr = ''

  // ① 本地先写：离线可用性靠它，失败也不能拖垮在线写
  if (args.localWrite && isNativePlatform()) {
    try {
      await args.localWrite()
      localOk = true
    } catch (e) {
      localErr = msgOf(e)
      console.warn('[offline] 本地写入失败，改为直接走服务端:', localErr)
    }
  }

  // ② 在线直写服务端
  if (args.serverWrite) {
    const r = await args.serverWrite()
    if (r.ok) {
      /**
       * ③ 已经在服务端写成功了 → **必须把这次本地写产生的队列项清掉**，
       * 否则 SyncEngine 会再上传一遍，用户会看到两份（旅行为"标题/标题-2"两本）。
       *
       * 注意条件故意**不看 localOk**：`writeLocalEntity` 是"先入队、再写行"，
       * 完全可能入队成功而写行失败（部分失败）。此时队列里已经躺着一条待上传项，
       * 若因 localOk=false 就跳过清理，照样会重复创建。
       */
      if (args.entityId) {
        try {
          await new SyncQueue(getSyncQueueStorage()).markDoneByEntityId(args.entityId)
        } catch {
          // 清队列失败不影响写入结果；同步侧仍有 remoteId 兜底
        }
      }
      try {
        await args.onServerOk?.(r.data)
      } catch {
        // 标记失败不影响写入结果
      }
      return { mode: 'server', data: r.data }
    }
    // ④ 服务端失败：本地已存就降级为待同步
    if (localOk) return { mode: 'local' }
    return { mode: 'failed', error: r.error || localErr || '保存失败' }
  }

  if (localOk) return { mode: 'local' }
  return { mode: 'failed', error: localErr || '保存失败' }
}
