/**
 * Repository 数据访问抽象（Stage 3.0a）。
 * 页面数据读取统一经这里：在线优先 fetch，离线/失败回退本地 SQLite。
 * Web（非原生）不启用离线，直接走远端。
 */
import { getConnectionStatus } from './native/network'
import { isNativePlatform } from './platform'

export interface ReadResult<T> {
  data: T
  source: 'remote' | 'local'
}

export type RemoteLoader<T> = () => Promise<T>
export type LocalLoader<T> = () => Promise<T | null>

let onlineCache = true
let onlineCheckedAt = 0
const ONLINE_TTL = 3000

/** 是否在线（短 TTL 缓存，避免频繁探测） */
export async function isOnline(): Promise<boolean> {
  const now = Date.now()
  if (now - onlineCheckedAt < ONLINE_TTL) return onlineCache
  try {
    const s = await getConnectionStatus()
    onlineCache = s.connected
    onlineCheckedAt = now
  } catch {
    onlineCache = true // 探测失败默认在线，走远端
  }
  return onlineCache
}

/** 在线优先、离线回退的读取 */
export async function readWithFallback<T>(remote: RemoteLoader<T>, local: LocalLoader<T>): Promise<ReadResult<T>> {
  if (!isNativePlatform()) {
    return { data: await remote(), source: 'remote' }
  }
  if (await isOnline()) {
    try {
      const data = await remote()
      onlineCache = true
      return { data, source: 'remote' }
    } catch {
      // 远端失败，回退本地
    }
  }
  const localData = await local()
  if (localData != null) {
    return { data: localData, source: 'local' }
  }
  // 本地无缓存：再尽力走一次远端（可能刚恢复网络）
  return { data: await remote(), source: 'remote' }
}
