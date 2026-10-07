'use client'

import { useRouter } from 'next/navigation'
import { Lock, X, Heart } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { useAlbumUnlock } from '@/hooks/use-album-unlock'

interface AlbumUnlockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  redirectToAlbum?: boolean
}

export default function AlbumUnlockModal({ isOpen, onClose, onSuccess, redirectToAlbum = true }: AlbumUnlockModalProps) {
  const router = useRouter()
  const { password, setPassword, error, verifying, submit, skip, close } = useAlbumUnlock({
    onClose,
    onSuccess: () => {
      onSuccess?.()
      if (redirectToAlbum) router.push('/album')
    },
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="相册已上锁">
      <div className="w-full max-w-sm bg-white/95 dark:bg-shell-surface/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/80 dark:border-shell-line overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <style>{`
          @keyframes fadeIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>

        <div className="relative p-8 bg-gradient-to-br from-travel-parchment to-travel-parchmentDim dark:from-[#1E1A1C] dark:to-[#241E22]">
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-travel-sand/50 hover:text-travel-sand hover:bg-white/60 dark:text-travel-sandSoft/60 dark:hover:text-travel-sandLight dark:hover:bg-white/10 rounded-full transition-colors"
            aria-label="关闭"
          >
            <Icon icon={X} size="sm" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-travel-sakura to-travel-bloom rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Icon icon={Heart} size="lg" tone="inverse" className="fill-white" />
            </div>

            <h3 className="text-xl font-bold text-travel-inkStrong dark:text-shell-text">
              相册已上锁
            </h3>
            <p className="text-sm text-travel-sand/70 dark:text-travel-sandSoft/80 mt-2">
              请输入纪念日作为密码
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <div className="relative">
                <Icon
                  icon={Lock}
                  size="sm"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-travel-sand/40"
                />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white/60 border border-travel-line rounded-2xl text-travel-inkStrong dark:text-shell-text placeholder-travel-sand/40 dark:bg-shell-surface2/80 dark:border-shell-line dark:placeholder-travel-sandSoft/50 focus:outline-none focus:ring-2 focus:ring-travel-bloom/60 focus:border-transparent transition-all"
                  placeholder="如 2023-06-20"
                  required
                  autoFocus
                />
              </div>
              <p className="text-xs text-travel-sand/40 mt-2 text-center dark:text-travel-sandSoft/50">
                支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 格式
              </p>
            </div>

            {error && (
              <div className="px-4 py-2.5 bg-travel-sakura/40 border border-travel-bloom/50 rounded-xl text-travel-accentStrong dark:bg-shell-surface/70 dark:border-shell-line dark:text-travel-bloom text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying}
              className="w-full py-3 bg-gradient-to-r from-travel-bloom to-travel-bloom text-white font-semibold rounded-2xl hover:from-travel-bloom hover:to-travel-accentSoft transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-travel-bloom/30"
            >
              {verifying ? '验证中...' : '解锁相册'}
            </button>
            <button
              type="button"
              onClick={skip}
              disabled={verifying}
              className="w-full py-2 text-sm text-travel-sand/70 hover:text-travel-accent transition-colors dark:text-travel-sandSoft/70"
            >
              没有纪念日？直接进入相册
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
