/**
 * 账号作用域（M-1 / P1-22）。
 *
 * 问题：本地 SQLite 是全局单库。登出、换账号、甚至 WebView 重载后，
 * 上一个账号的本地缓存仍会被读出来（列表/详情的"离线兜底"分支），
 * 待上传队列还会带着**新账号的 Cookie** 上传 —— 既是数据越权也是数据污染。
 *
 * 方案（不扩表结构）：meta 表存 accountId（取服务端 /api/me 的 User.id），
 * 每次校验发现"当前会话账号 ≠ 本地库归属账号"就把整库清空再认领。
 * 之所以优先用 meta 而不是给每张表加 ownerId：本地表有 10+ 张、写入点分散，
 * 改 schema + 全量改 SQL 的回归面远大于"整库清空"（离线缓存本来就可再拉）。
 *
 * 校验开销：/api/me 结果缓存 TTL 60s，读路径调用是廉价的；网络失败按"未知"处理，
 * 绝不因为校验不了就清库（离线优先，宁可少清一次也不能把用户离线数据清空）。
 */
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from './platform'
import { getMeta, setMeta, deleteMeta, META_KEYS } from './meta'
import { clearOfflineData } from './reset'

export type AccountScopeResult =
  /** 已校验一致，或 TTL 内跳过 */
  | 'ok'
  /** 老库首次认领（无 accountId），保留原有数据 */
  | 'adopted'
  /** 账号变化：已清空本地数据并重新认领 */
  | 'switched'
  /** 非原生端 / 未登录 / 校验失败：本次不做任何处置 */
  | 'skipped'

const CHECK_TTL_MS = 60_000

let lastCheckedAt = 0
let lastResult: AccountScopeResult = 'skipped'

/**
 * 当前会话账号 id（服务端 User.id 的字符串形式）；null=未登录/取不到。
 * 不做 window 守卫：调用方（ensureOfflineAccountScope）已用 isNativePlatform 过滤，
 * SSR 阶段拿到的就是 false —— 这里加 window 判断反而会让单测（node 环境）永远 skipped。
 */
export async function resolveCurrentAccountId(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('/api/me'), { credentials: 'include', cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { id?: unknown } } | null
    const raw = json?.data?.id
    if (raw == null) return null
    const id = String(raw)
    return id && id !== 'undefined' ? id : null
  } catch {
    return null
  }
}

export async function getOfflineAccountId(): Promise<string | null> {
  return getMeta(META_KEYS.accountId)
}

/** 登录成功后可直接认领（避免下一次读时触发一次整库清理） */
export async function setOfflineAccountId(accountId: string | null): Promise<void> {
  lastCheckedAt = Date.now()
  if (accountId) await setMeta(META_KEYS.accountId, accountId)
  else await deleteMeta(META_KEYS.accountId)
}

/**
 * 校验本地库归属与当前会话账号是否一致。不一致则清库并认领。
 * @param force 忽略 TTL（登出、启动首帧、登录跳转后使用）
 */
export async function ensureOfflineAccountScope(options?: { force?: boolean }): Promise<AccountScopeResult> {
  if (!isNativePlatform()) return 'skipped'
  if (!options?.force && Date.now() - lastCheckedAt < CHECK_TTL_MS) return lastResult

  const current = await resolveCurrentAccountId()
  lastCheckedAt = Date.now()
  if (!current) {
    lastResult = 'skipped'
    return 'skipped'
  }

  const stored = await getOfflineAccountId()
  if (stored === current) {
    lastResult = 'ok'
    return 'ok'
  }
  if (stored == null) {
    // 老版本升级上来的库：没有归属信息，无法判断是谁的数据。
    // 直接认领（不清库）—— 升级前只有当前登录者会写本地库，清了等于白丢离线缓存。
    await setOfflineAccountId(current)
    lastResult = 'adopted'
    return 'adopted'
  }

  await clearOfflineData()
  await setOfflineAccountId(current)
  lastResult = 'switched'
  return 'switched'
}

/** 测试/登出后重置进程内缓存，避免下一次调用被 TTL 短路 */
export function resetAccountScopeCache(): void {
  lastCheckedAt = 0
  lastResult = 'skipped'
}
