'use client'

import { useCallback, useState } from 'react'
import { RefreshCw, Check, Download } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { Loader } from '@/components/mobile/Loader'
import { DrawerRow } from '@/components/mobile/SideDrawer'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { hapticLight, hapticSuccess } from '@/lib/mobile/haptics'
import { APP_VERSION, APP_BUILD_NUMBER, isNewerVersion } from '@/lib/app-version'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { appUpdater, appUpdaterSupported } from '@/lib/modules/offline/app-updater'

/**
 * 「检测更新」抽屉行（2026-10-12 新增）
 * ============================================================================
 * 需求：我的 → 右上角三横线半屏抽屉里，加一行可手动检测版本更新，并显示当前版本。
 *
 * 与 AppUpdatePrompt 的分工：
 *   · AppUpdatePrompt 是**自动**的：原生壳启动时发现新版就弹全屏提示；
 *   · 本组件是**手动**的：用户主动点「检测更新」，随时可查，且明确告知结果
 *     （已是最新 / 发现新版本 / 检测失败），而不是"点了没反应"。
 *
 * 行为：
 *   · 展示当前版本 + 构建号（来源 lib/app-version，与 OTA 清单同一份真值）；
 *   · 点击 → 拉 /api/version 比对；有新版则走原生下载安装（Web 端则打开下载页）；
 *   · 全程有 loading / 成功 / 失败三态反馈与触觉，符合"每个可点元素都要有反馈"。
 */
export default function VersionCheckRow() {
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [upToDate, setUpToDate] = useState(false)

  const current = `v${APP_VERSION} (b${APP_BUILD_NUMBER})`

  const startNativeInstall = useCallback(async (url: string) => {
    if (!appUpdaterSupported()) {
      // 原生插件不可用（旧壳/Web）：退化为跳下载页，不让用户卡住
      window.location.href = url
      return
    }
    setInstalling(true)
    try {
      await appUpdater.downloadAndInstall(url)
      toast.info('下载中，完成后会提示安装')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败，请稍后重试')
    } finally {
      setInstalling(false)
    }
  }, [])

  const check = useCallback(async () => {
    if (checking || installing) return
    void hapticLight()
    setChecking(true)
    setUpToDate(false)
    try {
      const res = await fetch(apiUrl('/api/version'), { credentials: 'include' })
      if (!res.ok) throw new Error('bad status')
      const m = await res.json()
      const newer = isNewerVersion(APP_VERSION, m?.version || '0.0.0') ||
        Number(m?.buildNumber || 0) > APP_BUILD_NUMBER

      if (!newer) {
        setUpToDate(true)
        void hapticSuccess()
        toast.success(`已是最新版本 ${current}`)
        return
      }

      const remote = `v${m.version} (b${m.buildNumber})`
      if (isNativePlatform()) {
        toast.info(`发现新版本 ${remote}，开始下载…`)
        await startNativeInstall(m.downloadUrl)
      } else {
        toast.info(`发现新版本 ${remote}`)
        window.location.href = m.downloadUrl
      }
    } catch {
      toast.error('检测更新失败，请检查网络后重试')
    } finally {
      setChecking(false)
    }
  }, [checking, installing, current, startNativeInstall])

  // 规范 §6.1/§7：图标尺寸只走 <Icon> 三档；无限动画只允许 Loader 组件。
  // 原为裸 <Loader2 className="h-4 w-4 animate-spin">，被 token 门禁判为
  // 「图标尺寸自由取值」的新增回退。
  const trailing = checking ? (
    <Loader variant="ring" size="sm" label="" />
  ) : upToDate ? (
    <Icon icon={Check} size="sm" tone="success" />
  ) : (
    <Icon icon={isNativePlatform() ? Download : RefreshCw} size="sm" tone="muted" />
  )

  return (
    <DrawerRow
      icon={RefreshCw}
      title={installing ? '正在下载更新…' : checking ? '正在检测…' : '检测更新'}
      description={upToDate ? `当前 ${current} · 已是最新` : `当前版本 ${current}`}
      trailing={trailing}
      onClick={check}
    />
  )
}
