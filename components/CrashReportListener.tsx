'use client'

import { useCrashReport } from '@/hooks/use-crash-report'

/**
 * 全局崩溃上报的挂载壳：app/layout.tsx 是 **server component**，不能直接调 hook，
 * 由这个零渲染的客户端组件代挂（挂载即生效，渲染 null 不占 DOM）。
 */
export default function CrashReportListener() {
  useCrashReport()
  return null
}
