'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { appUpdater, appUpdaterSupported } from '@/lib/modules/offline/app-updater'
import { APP_VERSION, APP_BUILD_NUMBER, isNewerVersion } from '@/lib/app-version'

export interface VersionManifest {
  version: string
  buildNumber: number
  downloadUrl: string
  changelog?: string
  forceUpdate?: boolean
}

/**
 * 应用内更新的状态机。
 *
 * idle → downloading(0-100%) → installing（已拉起系统安装器）
 *                        ↘ needsPermission（Android 8+ 未授权「安装未知应用」）
 *                        ↘ error
 *
 * 为什么要有 needsPermission 这一态：Android 8+ 安装 APK 必须由用户显式授权，
 * 未授权时原生侧不会开始下载。用户授权后返回 App，我们用 visibilitychange 自动续跑，
 * 不需要他再点一次「立即更新」。**全程不跳浏览器**。
 */
export type UpdateStatus = 'idle' | 'downloading' | 'needsPermission' | 'installing' | 'error'

export function useAppUpdate() {
  const [manifest, setManifest] = useState<VersionManifest | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')
  /** 防止 visibilitychange 反复触发续跑 */
  const resumingRef = useRef(false)

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

  /** 原生事件 → 状态 */
  useEffect(() => {
    if (!appUpdaterSupported()) return
    let alive = true
    const handles: { remove: () => Promise<void> }[] = []
    void (async () => {
      const h1 = await appUpdater.onProgress((p) => {
        if (!alive) return
        setPercent(p)
        setStatus('downloading')
      })
      const h2 = await appUpdater.onDownloaded(() => {
        if (!alive) return
        setPercent(100)
        setStatus('installing')
      })
      const h3 = await appUpdater.onFailed((msg) => {
        if (!alive) return
        setError(msg)
        setStatus('error')
      })
      for (const h of [h1, h2, h3]) if (h) handles.push(h as { remove: () => Promise<void> })
    })()
    return () => {
      alive = false
      for (const h of handles) void h.remove().catch(() => {})
    }
  }, [])

  const dismiss = () => {
    // 强制更新不可跳过：dismiss 无效，提示持续阻断直到安装新版本
    if (manifest?.forceUpdate) return
    setDismissed(true)
  }

  /** 点击「立即更新 / 重试」 */
  const startUpdate = useCallback(async () => {
    if (!manifest?.downloadUrl) return
    // Web 端没有安装语义（桌面 / 调试用）：保持浏览器下载
    if (!isNativePlatform()) {
      window.open(manifest.downloadUrl, '_system')
      return
    }
    setError('')
    setPercent(0)
    try {
      const can = await appUpdater.canInstall()
      if (!can.allowed) {
        setStatus('needsPermission')
        return
      }
      const r = await appUpdater.downloadAndInstall(manifest.downloadUrl)
      if (r?.needsPermission) {
        setStatus('needsPermission')
        return
      }
      setStatus('downloading')
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失败，请重试')
      setStatus('error')
    }
  }, [manifest])

  /** 去系统设置授权「安装未知应用」 */
  const openInstallSettings = useCallback(async () => {
    try {
      await appUpdater.openInstallSettings()
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法打开系统设置')
      setStatus('error')
    }
  }, [])

  /** 只重试"打开安装器"（安装包已下载，用户上次取消了安装） */
  const installDownloaded = useCallback(async () => {
    try {
      const r = await appUpdater.installDownloaded()
      if (r?.needsPermission) {
        setStatus('needsPermission')
        return
      }
      setStatus('installing')
    } catch (e) {
      // 文件不在了 → 回退到重新下载
      setError(e instanceof Error ? e.message : '安装包已失效')
      setStatus('error')
    }
  }, [])

  // 授权后回到前台 → 自动续跑
  useEffect(() => {
    if (status !== 'needsPermission') {
      resumingRef.current = false
      return
    }
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || resumingRef.current) return
      resumingRef.current = true
      try {
        const can = await appUpdater.canInstall()
        if (can.allowed) await startUpdate()
      } catch {
        // 续跑失败就停在 needsPermission，用户可手动点「继续更新」
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [status, startUpdate])

  return {
    hasUpdate: manifest != null && !dismissed,
    manifest,
    dismiss,
    /** 兼容旧调用点 */
    download: startUpdate,
    status,
    percent,
    error,
    startUpdate,
    openInstallSettings,
    installDownloaded,
  }
}
