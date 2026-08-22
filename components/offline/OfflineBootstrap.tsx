'use client'

import { useEffect } from 'react'
import { startSyncEngine } from '@/lib/modules/offline/bootstrap'

/**
 * 原生壳启动引导：初始化离线同步引擎（联网自动回放待上传 + 拉取远端到本地 SQLite）。
 * Web 端 isNativePlatform()=false，startSyncEngine 内部 no-op，渲染 null。
 */
export default function OfflineBootstrap() {
  useEffect(() => {
    void startSyncEngine()
  }, [])
  return null
}
