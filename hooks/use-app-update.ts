'use client'

import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { APP_VERSION, APP_BUILD_NUMBER, isNewerVersion } from '@/lib/app-version'

export interface VersionManifest {
  version: string
  buildNumber: number
  downloadUrl: string
  changelog?: string
  forceUpdate?: boolean
}

/**
 * OTA 版本检查（仅原生壳启用）：启动时拉取 /api/version，
 * 与本地 APP_VERSION / APP_BUILD_NUMBER 比较，有新版则提示下载安装。
 */
export function useAppUpdate() {
  const [manifest, setManifest] = useState<VersionManifest | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isNativePlatform()) return
    fetch(apiUrl('/api/version'), { credentials: 'include' })
      .then((r) => r.json())
      .then((m: VersionManifest) => {
        const newerVersion = isNewerVersion(APP_VERSION, m?.version || '0.0.0')
        const newerBuild = Number(m?.buildNumber || 0) > APP_BUILD_NUMBER
        if (newerVersion || newerBuild) setManifest(m)
      })
      .catch(() => {})
  }, [])

  const dismiss = () => setDismissed(true)

  const download = () => {
    if (!manifest?.downloadUrl) return
    // _system 让 Capacitor 打开系统浏览器（下载 APK → 用户手动安装）
    window.open(manifest.downloadUrl, '_system')
  }

  return {
    hasUpdate: manifest != null && !dismissed,
    manifest,
    dismiss,
    download,
  }
}
