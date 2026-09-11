'use client'

import { useEffect } from 'react'
import { Download, Sparkles } from 'lucide-react'
import { useAppUpdate } from '@/hooks/use-app-update'
import { BottomSheet } from '@/components/mobile/BottomSheet'

/**
 * OTA 版本更新提示：原生壳检测到新版后弹窗，引导下载 APK 安装。
 * Web 端不启用（useAppUpdate 内部 isNativePlatform 守卫，返回 null）。
 * - 非强制更新：底部抽屉（BottomSheet），可「稍后再说」；
 * - 强制更新（forceUpdate=true）：全屏阻断层，不可跳过，直到安装新版。
 */
export default function AppUpdatePrompt() {
  const { hasUpdate, manifest, dismiss, download } = useAppUpdate()
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

  if (forced) {
    return (
      <div className="fixed inset-0 z-[140] flex flex-col items-center justify-center bg-[var(--m-bg)] px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
          <Sparkles className="h-8 w-8" />
        </span>
        <h2 className="mt-6 text-[22px] font-bold tracking-tight text-[var(--m-text)]">
          需要更新至新版本
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--m-muted)]">
          当前版本 v{manifest.version}（build {manifest.buildNumber}）已不再支持，
          请下载最新版后继续使用。
        </p>
        <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-[var(--m-muted)]">
          {manifest.changelog || '优化体验，支持离线浏览与自动同步'}
        </p>
        <button
          type="button"
          onClick={download}
          className="m-press mt-8 flex h-12 w-full max-w-[280px] items-center justify-center gap-2 rounded-full bg-[var(--m-accent)] text-[15px] font-semibold text-[var(--m-on-accent)] shadow-[0_10px_28px_-12px_var(--m-accent)]"
        >
          <Download className="h-5 w-5" />
          下载并安装
        </button>
      </div>
    )
  }

  return (
    <BottomSheet open title={`发现新版本 v${manifest.version}`} onClose={dismiss}>
      <div className="pt-1 text-[15px] leading-relaxed text-[var(--m-muted)]">
        {manifest.changelog || '优化体验，支持离线浏览与自动同步'}
      </div>
      <div className="mt-6 flex gap-3 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={dismiss}
          className="flex-1 rounded-full py-3 text-[15px] font-medium text-[var(--m-muted)] ring-1 ring-[var(--m-line-strong)] transition active:scale-[0.97]"
        >
          稍后再说
        </button>
        <button
          type="button"
          onClick={download}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--m-accent)] py-3 text-[15px] font-semibold text-[var(--m-on-accent)] transition active:scale-[0.97]"
        >
          <Download className="h-4 w-4" />
          立即更新
        </button>
      </div>
    </BottomSheet>
  )
}
