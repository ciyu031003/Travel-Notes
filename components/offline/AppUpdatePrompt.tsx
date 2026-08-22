'use client'

import { Download, X } from 'lucide-react'
import { useAppUpdate } from '@/hooks/use-app-update'

/**
 * OTA 版本更新提示：原生壳检测到新版后弹窗，引导下载 APK 安装。
 * Web 端不启用（useAppUpdate 内部 isNativePlatform 守卫，返回 null）。
 */
export default function AppUpdatePrompt() {
  const { hasUpdate, manifest, dismiss, download } = useAppUpdate()

  if (!hasUpdate || !manifest) return null

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--social-line)] bg-[var(--social-surface)] p-6 shadow-2xl">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-[var(--social-text)]">发现新版本 v{manifest.version}</h2>
          <button onClick={dismiss} aria-label="关闭" className="rounded-full p-1 text-[var(--social-muted)] hover:text-[var(--social-text)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-[var(--social-muted)]">{manifest.changelog || '优化体验，支持离线浏览与自动同步'}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={dismiss}
            className="flex-1 rounded-full py-2.5 text-sm font-medium text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"
          >
            稍后再说
          </button>
          <button
            onClick={download}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--social-accent)] py-2.5 text-sm font-semibold text-[var(--social-on-accent)] transition hover:brightness-110"
          >
            <Download className="h-4 w-4" />
            立即更新
          </button>
        </div>
      </div>
    </div>
  )
}
