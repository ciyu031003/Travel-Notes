'use client'

/**
 * 应用内更新（原生插件 `AppUpdater` 的前端封装）。
 *
 * 为什么要自己写插件：Capacitor 生态里没有"安装 APK"能力，而 Android 8+ 还要求
 * 用户为「安装未知应用」单独授权。此前 OTA 更新是 `window.open(url, '_system')`
 * —— 直接把用户丢给系统浏览器，下载完还得自己在文件管理器里找 APK。
 * 现在：应用内下载（带百分比）→ 完成后直接拉起系统安装器。
 *
 * Web 端一律不做事（`isNativePlatform()` 守卫）：浏览器里没有安装语义。
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isNativePlatform } from './platform'

export interface AppUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean; sdkInt: number }>
  openInstallSettings(): Promise<void>
  /** 未授权安装未知应用时返回 { needsPermission: true }（不抛错，便于前端引导） */
  downloadAndInstall(options: { url: string; fileName?: string }): Promise<{
    started?: boolean
    needsPermission?: boolean
  }>
  installDownloaded(options?: { fileName?: string }): Promise<{ needsPermission?: boolean }>
  addListener(
    eventName: 'downloadProgress',
    listener: (data: { percent: number; received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'downloaded',
    listener: (data: { path: string; bytes: number }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'downloadFailed',
    listener: (data: { message: string }) => void,
  ): Promise<PluginListenerHandle>
}

/** 下载到应用私有目录时的固定文件名（安装时按同名查找） */
export const UPDATE_FILE_NAME = 'tiantu-update.apk'

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater')

export function appUpdaterSupported(): boolean {
  return isNativePlatform()
}

export const appUpdater = {
  async canInstall(): Promise<{ allowed: boolean; sdkInt: number }> {
    if (!isNativePlatform()) return { allowed: true, sdkInt: 0 }
    return AppUpdater.canInstall()
  },
  async openInstallSettings(): Promise<void> {
    if (!isNativePlatform()) return
    await AppUpdater.openInstallSettings()
  },
  async downloadAndInstall(url: string): Promise<{ started?: boolean; needsPermission?: boolean }> {
    if (!isNativePlatform()) return { started: false }
    return AppUpdater.downloadAndInstall({ url, fileName: UPDATE_FILE_NAME })
  },
  async installDownloaded(): Promise<{ needsPermission?: boolean }> {
    if (!isNativePlatform()) return {}
    return AppUpdater.installDownloaded({ fileName: UPDATE_FILE_NAME })
  },
  async onProgress(cb: (percent: number) => void): Promise<PluginListenerHandle | null> {
    if (!isNativePlatform()) return null
    return AppUpdater.addListener('downloadProgress', (d) => cb(d?.percent ?? 0))
  },
  async onDownloaded(cb: () => void): Promise<PluginListenerHandle | null> {
    if (!isNativePlatform()) return null
    return AppUpdater.addListener('downloaded', () => cb())
  },
  async onFailed(cb: (message: string) => void): Promise<PluginListenerHandle | null> {
    if (!isNativePlatform()) return null
    return AppUpdater.addListener('downloadFailed', (d) => cb(d?.message || '下载失败'))
  },
}
