'use client'

import { useEffect } from 'react'
import { apiUrl } from '@/lib/api-base'
import { startSyncEngine } from '@/lib/modules/offline/bootstrap'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { ensureOfflineAccountScope } from '@/lib/modules/offline/account-scope'
import { saveHomeSnapshot } from '@/lib/modules/offline/home-snapshot'
import { installClientErrorReporter } from '@/lib/modules/offline/diagnostics'
import { runMediaMaintenance } from '@/lib/media/local-files'

/**
 * 原生壳启动引导。
 *
 * P2-29 改造（首屏优先）：
 *  · 同步引擎**延迟 2s** 启动（原来挂载即 sync，4 个全量 pull 与首页 /api/home 抢同一条网络）；
 *  · 引擎启动首轮只上传不拉取（见 SyncEngine.start）；
 *  · 启动前先校验账号作用域（M-1：换账号必须先清库，再让引擎写新账号的数据）；
 *  · 顺手把最近一次 /api/home 落成本地快照（首页离线兜底的写入端；读取端由 Web 侧接入）。
 *
 * 另外在这里安装全局错误上报（P2-30）：layout 由 Web 侧负责，不改它。
 */
const SYNC_START_DELAY_MS = 2000

export default function OfflineBootstrap() {
  useEffect(() => {
    const uninstallReporter = installClientErrorReporter()
    if (!isNativePlatform()) return uninstallReporter

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          // 强制校验一次（忽略 TTL）：App 冷启动是换账号后最可能残留数据的时刻
          await ensureOfflineAccountScope({ force: true })
        } catch {
          // 校验失败按"未知"处理，不清库
        }
        if (cancelled) return
        try {
          // B5：启动时做一次媒体维护（先收尾已上传原图，再按 400MB 配额 LRU）
          void runMediaMaintenance().catch(() => {})
        } catch {
          // 维护失败不影响启动
        }
        try {
          await startSyncEngine()
        } catch {
          // 引擎启动失败不影响页面渲染；下一轮网络变化会再触发
        }
        if (cancelled) return
        try {
          const res = await fetch(apiUrl('/api/home'), { credentials: 'include' })
          if (res.ok) await saveHomeSnapshot(await res.json())
        } catch {
          // 未登录/离线：跳过快照写入
        }
      })()
    }, SYNC_START_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      uninstallReporter()
    }
  }, [])
  return null
}
