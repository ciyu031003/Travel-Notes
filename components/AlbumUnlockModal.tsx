'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, X, Heart, ArrowLeft } from 'lucide-react'

interface AlbumUnlockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  redirectToAlbum?: boolean
}

export default function AlbumUnlockModal({ isOpen, onClose, onSuccess, redirectToAlbum = true }: AlbumUnlockModalProps) {
  const router = useRouter()
  const [albumPassword, setAlbumPassword] = useState('')
  const [albumError, setAlbumError] = useState('')
  const [albumVerifying, setAlbumVerifying] = useState(false)

  const handleAlbumUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setAlbumError('')
    setAlbumVerifying(true)

    try {
      const res = await fetch('/api/verify-album-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: albumPassword }),
      })

      if (res.ok) {
        setAlbumPassword('')
        onClose()
        onSuccess?.()
        if (redirectToAlbum) {
          router.push('/album')
        }
      } else {
        const data = await res.json()
        setAlbumError(data.error || '验证失败')
      }
    } catch {
      setAlbumError('网络错误，请重试')
    } finally {
      setAlbumVerifying(false)
    }
  }

  const handleClose = () => {
    setAlbumPassword('')
    setAlbumError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
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
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-travel-sand/50 hover:text-travel-sand hover:bg-white/60 dark:text-travel-sandSoft/60 dark:hover:text-travel-sandLight dark:hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-travel-sakura to-travel-bloom rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Heart className="w-8 h-8 text-white fill-white" />
            </div>

            <h3 className="text-xl font-bold text-travel-inkStrong dark:text-shell-text">
              相册已上锁
            </h3>
            <p className="text-sm text-travel-sand/70 dark:text-travel-sandSoft/80 mt-2">
              请输入纪念日作为密码
            </p>
          </div>

          <form onSubmit={handleAlbumUnlock} className="mt-6 space-y-4">
            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-travel-sand/40" />
                <input
                  type="text"
                  value={albumPassword}
                  onChange={(e) => setAlbumPassword(e.target.value)}
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

            {albumError && (
              <div className="px-4 py-2.5 bg-travel-sakura/40 border border-travel-bloom/50 rounded-xl text-travel-accentStrong dark:bg-[#32261D]/70 dark:border-[#4A3427] dark:text-travel-bloom text-sm text-center">
                {albumError}
              </div>
            )}

            <button
              type="submit"
              disabled={albumVerifying}
              className="w-full py-3 bg-gradient-to-r from-travel-bloom to-travel-bloom text-white font-semibold rounded-2xl hover:from-travel-bloom hover:to-travel-accentSoft transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-travel-bloom/30"
            >
              {albumVerifying ? '验证中...' : '解锁相册'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

