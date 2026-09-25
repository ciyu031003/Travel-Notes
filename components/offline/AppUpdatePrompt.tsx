'use client'

import { useEffect } from 'react'
import { CheckCircle2, Download, RefreshCw, Settings2, Sparkles } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { useAppUpdate } from '@/hooks/use-app-update'
import { BottomSheet } from '@/components/mobile/BottomSheet'

/**
 * OTA 版本更新提示（原生壳）。
 *
 * 本次改动（真机要求："不要跳到浏览器下载，应用内下载完成后直接安装"）：
 *  · 下载在**应用内**完成，带百分比进度条；
 *  · 完成即拉起系统安装器，不再把用户丢给浏览器/文件管理器；
 *  · Android 8+ 首次需要「安装未知应用」授权 → 直接给一个按钮跳到系统设置，
 *    授权返回 App 后自动继续下载（不需要再点一次）。
 *
 * 三种形态：非强制＝底部抽屉（可稍后再说）；强制＝全屏阻断；都按状态机渲染内容。
 */
export default function AppUpdatePrompt() {
  const {
    hasUpdate, manifest, dismiss,
    status, percent, error,
    startUpdate, openInstallSettings, installDownloaded,
  } = useAppUpdate()
  const forced = manifest?.forceUpdate === true

  // 强制更新：锁定背景滚动，阻断一切操作
  useEffect(() => {
    if (!forced) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [forced])

  if (!hasUpdate || !manifest) return null

  const changelog = manifest.changelog || '优化体验，支持离线浏览与自动同步'

  /** 状态区：下载进度 / 需要授权 / 安装中 / 失败 */
  const body = (
    <>
      {status === 'downloading' && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[13px] text-[var(--m-muted)]">
            <span>正在下载更新…</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--m-surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--m-accent)] transition-[width] duration-200"
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-[var(--m-faint)]">下载完成后会自动打开安装界面</p>
        </div>
      )}

      {status === 'needsPermission' && (
        <div className="mt-4 rounded-2xl bg-[var(--m-accent-soft)] px-4 py-3">
          <p className="flex items-center gap-2 text-[14px] font-medium text-[var(--m-accent-strong)]">
            <Icon icon={Settings2} size="sm" />
            需要先允许安装应用
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--m-accent-strong)]">
            安卓要求为「行迹」单独开启「安装未知应用」。点下面的按钮去开启，返回后会自动继续下载。
          </p>
        </div>
      )}

      {status === 'installing' && (
        <p className="mt-4 flex items-center gap-2 text-[14px] text-[var(--m-accent-strong)]">
          <Icon icon={CheckCircle2} size="sm" />
          已下载完成，正在打开安装界面…
        </p>
      )}

      {status === 'error' && error && (
        <p className="mt-4 rounded-2xl bg-[var(--m-surface-2)] px-4 py-3 text-[13px] text-[var(--m-danger)]">{error}</p>
      )}
    </>
  )

  /** 操作区 */
  const actions = forced ? (
    <div className="mt-6 w-full max-w-[280px]">
      {status === 'needsPermission' ? (
        <Button block size="lg" icon={Settings2} onClick={() => void openInstallSettings()}>
          去开启安装权限
        </Button>
      ) : status === 'installing' ? (
        <Button block size="lg" icon={Download} onClick={() => void installDownloaded()}>
          打开安装界面
        </Button>
      ) : status === 'downloading' ? (
        <Button block size="lg" loading disabled>
          正在下载 {percent}%
        </Button>
      ) : (
        <Button block size="lg" icon={Download} onClick={() => void startUpdate()}>
          {status === 'error' ? '重试下载' : '下载并安装'}
        </Button>
      )}
    </div>
  ) : (
    <div className="mt-6 flex gap-3 pb-[env(safe-area-inset-bottom)]">
      {status === 'idle' || status === 'error' ? (
        <>
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-full py-3 text-[15px] font-medium text-[var(--m-muted)] ring-1 ring-[var(--m-line-strong)] transition active:scale-[0.97]"
          >
            稍后再说
          </button>
          <Button className="flex-1" icon={status === 'error' ? RefreshCw : Download} onClick={() => void startUpdate()}>
            {status === 'error' ? '重试' : '立即更新'}
          </Button>
        </>
      ) : status === 'needsPermission' ? (
        <>
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-full py-3 text-[15px] font-medium text-[var(--m-muted)] ring-1 ring-[var(--m-line-strong)] transition active:scale-[0.97]"
          >
            稍后再说
          </button>
          <Button className="flex-1" icon={Settings2} onClick={() => void openInstallSettings()}>
            去开启权限
          </Button>
        </>
      ) : status === 'installing' ? (
        <Button block icon={Download} onClick={() => void installDownloaded()}>
          重新打开安装界面
        </Button>
      ) : (
        <Button block loading disabled>
          正在下载 {percent}%
        </Button>
      )}
    </div>
  )

  if (forced) {
    return (
      <div className="fixed inset-0 z-[140] flex flex-col items-center justify-center bg-[var(--m-bg)] px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
          <Icon icon={Sparkles} size="lg" />
        </span>
        <h2 className="mt-6 text-[22px] font-bold tracking-tight text-[var(--m-text)]">需要更新至新版本</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--m-muted)]">
          当前版本 v{manifest.version}（build {manifest.buildNumber}）已不再支持，请更新后继续使用。
        </p>
        <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-[var(--m-muted)]">{changelog}</p>
        {body}
        {actions}
      </div>
    )
  }

  return (
    <BottomSheet open title={`发现新版本 v${manifest.version}`} onClose={dismiss}>
      <div className="pt-1 text-[15px] leading-relaxed text-[var(--m-muted)]">{changelog}</div>
      {body}
      {actions}
    </BottomSheet>
  )
}
