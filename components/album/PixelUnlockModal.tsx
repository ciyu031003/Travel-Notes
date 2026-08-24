'use client'

import { useState } from 'react'
import { Lock, X } from 'lucide-react'

interface PixelUnlockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * 像素风相册解锁弹窗（SavePoint 风格）：羊皮纸书 + 金色书角 + MC 按钮
 * 仅用于相册页；登录页等其它入口继续使用 AlbumUnlockModal
 */
export default function PixelUnlockModal({ isOpen, onClose, onSuccess }: PixelUnlockModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleClose = () => {
    setPassword('')
    setError('')
    onClose()
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setVerifying(true)
    try {
      const res = await fetch('/api/verify-album-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: password }),
      })
      if (res.ok) {
        setPassword('')
        onClose()
        onSuccess()
      } else {
        const data = await res.json()
        setError(data.error || '验证失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setVerifying(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-sm pixel-book-container rounded-sm p-6">
        <div className="pixel-corner-gold-tl" />
        <div className="pixel-corner-gold-tr" />
        <div className="pixel-corner-gold-bl" />
        <div className="pixel-corner-gold-br" />

        <button
          type="button"
          onClick={handleClose}
          className="pixel-close-btn absolute top-3 right-3"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="text-center mb-5 select-none">
          <div className="book-cover-3d w-20 h-24 mx-auto flex items-center justify-center mb-4 rounded-sm">
            <Lock className="w-7 h-7 text-album-accent" />
          </div>
          <h3 className="font-zpix text-xl font-bold text-pixel-ink tracking-wider">相册已上锁</h3>
          <p className="text-xs text-album-warm mt-1.5">请输入纪念日作为密码</p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pixel-input text-sm text-center"
            placeholder="如 2023-06-20"
            required
            autoFocus
          />
          <p className="text-xs text-pixel-muted text-center select-none">
            支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日
          </p>
          {error && (
            <p className="text-xs text-pixel-error font-bold text-center bg-pixel-goldPale/70 border-2 border-pixel-error p-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={verifying}
            className="w-full mc-button mc-button-gold !py-2.5 text-xs font-bold"
          >
            {verifying ? '正在解锁...' : '解锁相册'}
          </button>
        </form>
      </div>
    </div>
  )
}
