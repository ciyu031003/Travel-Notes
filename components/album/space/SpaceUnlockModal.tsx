'use client'

import { Lock, X, Sparkles } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { useAlbumUnlock } from '@/hooks/use-album-unlock'

interface SpaceUnlockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * 银河模式解锁弹窗（Mineradio 玻璃质感版）。
 * 解锁状态机走 useAlbumUnlock（1.21.0 收敛），视觉保留银河玻璃主题。
 */
export default function SpaceUnlockModal({ isOpen, onClose, onSuccess }: SpaceUnlockModalProps) {
  const { password, setPassword, error, verifying, submit, close } = useAlbumUnlock({
    onClose,
    onSuccess,
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="相册已上锁">
      <div className="relative w-full max-w-sm space-glass rounded-3xl p-7 text-center">
        <button
          type="button"
          onClick={close}
          className="absolute top-3 right-3 space-glass-btn w-8 h-8 rounded-full flex items-center justify-center text-album-text1"
          aria-label="关闭"
        >
          <Icon icon={X} size="sm" />
        </button>

        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-album-bg0/70 border border-white/15 flex items-center justify-center shadow-[0_0_30px_var(--album-accent-dim)]">
          <Icon icon={Lock} size="lg" className="text-album-accent" />
        </div>
        <h3 className="text-album-text1 text-lg font-semibold tracking-widest">相册已上锁</h3>
        <p className="text-album-text2 text-xs mt-1.5">输入纪念日，唤醒旅行中的回忆</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full space-input text-sm text-center text-album-text1"
            placeholder="如 2023-06-20"
            required
            autoFocus
          />
          <p className="text-xs text-album-text2 select-none">
            支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日
          </p>
          {error && (
            <p className="text-xs text-danger-500 font-bold text-center bg-danger-500/10 border border-danger-600/30 rounded-xl p-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-full space-glass-btn text-album-text1 text-sm font-bold !py-2.5 disabled:opacity-50"
          >
            {verifying ? '正在唤醒银河...' : '解锁相册'}
          </button>
          <p className="flex items-center justify-center gap-1 text-xs text-album-text2">
            <Icon icon={Sparkles} size="sm" className="text-album-accent" />
            解锁后即可进入 360° 银河唱片空间
          </p>
        </form>
      </div>
    </div>
  )
}
