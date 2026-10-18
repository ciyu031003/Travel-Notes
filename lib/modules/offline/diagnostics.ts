/**
 * 最小崩溃上报（P2-30）。
 *
 * 为什么自建而不是接 Sentry：本仓库本轮不允许新增依赖，且移动壳是静态导出，
 * "一条 POST + 服务端 console.error" 就足以覆盖当前最大的可观测性缺口 ——
 * 线上白屏/JS 报错此前**完全不可观测**（历次故障只能靠用户截图猜）。
 *
 * 开关与节流：
 *  · 只在原生壳或显式 NEXT_PUBLIC_DIAGNOSTICS=1 时启用（不影响普通 Web 首屏与隐私）；
 *  · 每次会话最多上报 MAX_REPORTS_PER_SESSION 条，避免报错风暴把网络打满；
 *  · 上报失败静默（诊断代码自己抛错会变成新的错误源）。
 */
import { apiUrl } from '@/lib/api-base'
import { APP_VERSION, APP_BUILD_NUMBER } from '@/lib/app-version'
import { isNativePlatform } from './platform'

const MAX_REPORTS_PER_SESSION = 10

let installed = false
let sent = 0

export function diagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (process.env.NEXT_PUBLIC_DIAGNOSTICS === '1') return true
  return isNativePlatform()
}

export interface ClientErrorPayload {
  message: string
  stack?: string
  url?: string
}

/** 上报一条客户端错误（best-effort） */
export async function reportClientError(payload: ClientErrorPayload): Promise<void> {
  if (!diagnosticsEnabled() || sent >= MAX_REPORTS_PER_SESSION) return
  sent += 1
  try {
    await fetch(apiUrl('/api/diagnostics'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        message: String(payload.message || 'unknown').slice(0, 2000),
        stack: payload.stack ? String(payload.stack).slice(0, 8000) : undefined,
        url: payload.url || (typeof location !== 'undefined' ? location.href : ''),
        appVersion: APP_VERSION,
        buildNumber: APP_BUILD_NUMBER,
      }),
    })
  } catch {
    // 上报失败不能引发新的错误
  }
}

/**
 * 安装全局错误钩子（window.onerror + unhandledrejection）。
 * 返回卸载函数；重复调用是幂等的（React 严格模式下 effect 会跑两次）。
 */
export function installClientErrorReporter(): () => void {
  if (typeof window === 'undefined' || installed || !diagnosticsEnabled()) return () => {}
  installed = true

  const onError = (event: ErrorEvent) => {
    const err = event.error
    void reportClientError({
      message: event.message || 'window.onerror',
      stack: err instanceof Error ? err.stack : undefined,
    })
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    void reportClientError({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    installed = false
  }
}
