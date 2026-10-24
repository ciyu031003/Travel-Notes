/**
 * 客户端错误上报器（P-07 后半，1.29.0）——lib/modules/diagnostics/client-error.ts 的发送端。
 *
 * 设计约束（都与"上报通道绝不能反噬主流程"有关）：
 *  · 全程 best-effort：任何异常吞掉，上报失败不打日志不重试（服务端还有 IP 限流）；
 *  · 同一 message 每会话只报一次（崩溃循环时服务端不会被同一错误刷屏），
 *    每会话上限 20 条（内存计数，够诊断用）；
 *  · sendBeacon 优先（页面卸载时也能发出），退化为 keepalive fetch；
 *  · never await：调用方（全局 error 监听、React 边界）都是 fire-and-forget。
 */
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { APP_VERSION, APP_BUILD_NUMBER } from '@/lib/app-version'

export type ReportableErrorKind = 'js-error' | 'unhandled-rejection' | 'react-boundary'

const MAX_PER_SESSION = 20
/** 同 message 去重窗口：会话内只报首次 */
const seenMessages = new Set<string>()
let sentCount = 0

export interface ClientErrorPayload {
  kind: ReportableErrorKind
  message: string
  stack?: string
  url?: string
}

export function reportClientError(payload: ClientErrorPayload): void {
  try {
    if (sentCount >= MAX_PER_SESSION) return
    const key = payload.kind + '::' + payload.message
    if (seenMessages.has(key)) return
    seenMessages.add(key)
    sentCount += 1

    const body = JSON.stringify({
      kind: payload.kind,
      // Error.message 理论上是字符串，但任何代码都可能 throw 任意值——这里全部强制 String
      message: String(payload.message ?? 'unknown').slice(0, 500),
      stack: payload.stack ? String(payload.stack).slice(0, 4000) : undefined,
      url: (payload.url ?? (typeof location !== 'undefined' ? location.href : '')).slice(0, 300),
      appVersion: APP_VERSION,
      buildNumber: APP_BUILD_NUMBER,
      platform: isNativePlatform() ? 'native' : 'web',
    })

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(apiUrl('/api/diagnostics/client-error'), blob)) return
    }
    void fetch(apiUrl('/api/diagnostics/client-error'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // 上报器自身崩溃时保持静默
  }
}

/** 把任意 throw 值规整为 message/stack（throw 1 / throw null / throw Error 都要能报） */
export function describeThrown(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message || value.name || 'Error', stack: value.stack }
  }
  if (typeof value === 'string') return { message: value }
  try {
    return { message: JSON.stringify(value) ?? String(value) }
  } catch {
    return { message: String(value) }
  }
}
