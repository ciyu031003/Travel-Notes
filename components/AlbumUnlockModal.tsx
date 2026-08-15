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
      <div className="w-full max-w-sm bg-white/95 dark:bg-[#1B2128]/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/80 dark:border-[#2C343E] overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <style>{`
          @keyframes fadeIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>

        <div className="relative p-8 bg-gradient-to-br from-[#FDF5ED] to-[#F5EDE4] dark:from-[#1E1A1C] dark:to-[#241E22]">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-[#8B7355]/50 hover:text-[#8B7355] hover:bg-white/60 dark:text-[#C2AF9A]/60 dark:hover:text-[#E4D6C4] dark:hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Heart className="w-8 h-8 text-white fill-white" />
            </div>

            <h3 className="text-xl font-bold text-[#5A4A3A] dark:text-[#E8E6E1]">
              相册是我们的秘密
            </h3>
            <p className="text-sm text-[#8B7355]/70 dark:text-[#C2AF9A]/80 mt-2">
              请输入恋爱纪念日作为密码
            </p>
          </div>

          <form onSubmit={handleAlbumUnlock} className="mt-6 space-y-4">
            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7355]/40" />
                <input
                  type="text"
                  value={albumPassword}
                  onChange={(e) => setAlbumPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white/60 border border-[#E8DDD4] rounded-2xl text-[#5A4A3A] dark:text-[#E8E6E1] placeholder-[#8B7355]/40 dark:bg-[#161B22]/80 dark:border-[#2C343E] dark:placeholder-[#C2AF9A]/50 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]/60 focus:border-transparent transition-all"
                  placeholder="如 2023-06-20"
                  required
                  autoFocus
                />
              </div>
              <p className="text-xs text-[#8B7355]/40 mt-2 text-center dark:text-[#C2AF9A]/50">
                支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 格式
              </p>
            </div>

            {albumError && (
              <div className="px-4 py-2.5 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 rounded-xl text-[#8B4A5A] dark:bg-[#3A2B31]/70 dark:border-[#5A3A44] dark:text-[#E8B8C2] text-sm text-center">
                {albumError}
              </div>
            )}

            <button
              type="submit"
              disabled={albumVerifying}
              className="w-full py-3 bg-gradient-to-r from-[#E8B8C2] to-[#D4A5B0] text-white font-semibold rounded-2xl hover:from-[#D8A8B2] hover:to-[#C495A0] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#E8B8C2]/30"
            >
              {albumVerifying ? '验证中...' : '解锁相册'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
