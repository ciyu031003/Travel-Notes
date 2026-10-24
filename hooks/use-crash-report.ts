'use client'

import { useEffect } from 'react'
import { describeThrown, reportClientError } from '@/lib/client/diagnostics'

/**
 * 全局崩溃/异常上报（P-07 后半，1.29.0）。
 *
 * 挂载在根布局（app/layout.tsx），监听三类来源：
 *  1. window 'error' —— 未捕获的同步异常与资源加载错误（后者无 message，跳过）；
 *  2. window 'unhandledrejection' —— 未处理的 Promise 拒绝（离线 fetch 失败常被
 *     上层吞掉，到这里的多是真问题）；
 *  3. React ErrorBoundary —— components/ErrorBoundary 显式调用 reportClientError。
 *
 * 为什么不接 Sentry：自建通道零外部依赖、数据不出自建服务器，与项目"私人记录"
 * 的隐私定位一致；量小（客户端去重 + 服务端限流）也不需要聚合平台。
 * 原生层（Android WebView 进程内崩溃）不在 JS 可观测范围，仍靠 logcat/商店渠道。
 */
export function useCrashReport(): void {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // 资源加载错误（img/script onerror 冒泡）没有 error 对象，噪音大且不可行动
      if (!event.error && !event.message) return
      reportClientError({
        kind: 'js-error',
        message: event.message || (event.error instanceof Error ? event.error.message : 'unknown'),
        stack: event.error instanceof Error ? event.error.stack : undefined,
      })
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      const { message, stack } = describeThrown(event.reason)
      reportClientError({ kind: 'unhandled-rejection', message, stack })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
}
