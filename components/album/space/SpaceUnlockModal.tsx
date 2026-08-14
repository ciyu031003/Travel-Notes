'use client'

import { useState } from 'react'
import { Lock, X, Sparkles } from 'lucide-react'

interface SpaceUnlockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * 银河模式解锁弹窗（Mineradio 玻璃质感版）：逻辑与 PixelUnlockModal 一致
 */
export default function SpaceUnlockModal({ isOpen, onClose, onSuccess }: SpaceUnlockModalProps) {
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
      <div className="relative w-full max-w-sm space-glass rounded-3xl p-7 text-center">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 space-glass-btn w-8 h-8 rounded-full flex items-center justify-center text-white/70"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#0a0c16]/70 border border-white/15 flex items-center justify-center shadow-[0_0_30px_rgba(120,140,255,0.35)]">
          <Lock className="w-7 h-7 text-amber-200/90" />
        </div>
        <h3 className="text-white/95 text-lg font-semibold tracking-widest">相册是我们的秘密</h3>
        <p className="text-white/45 text-xs mt-1.5">输入恋爱纪念日，唤醒银河中的回忆</p>

        <form onSubmit={handleUnlock} className="mt-5 space-y-3">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full space-input text-sm text-center text-white/90"
            placeholder="如 2023-06-20"
            required
            autoFocus
          />
          <p className="text-[9px] text-white/35 select-none">
            支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日
          </p>
          {error && (
            <p className="text-[11px] text-rose-300 font-bold text-center bg-rose-500/10 border border-rose-400/30 rounded-xl p-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-full space-glass-btn text-white/95 text-sm font-bold !py-2.5 disabled:opacity-50"
          >
            {verifying ? '正在唤醒银河...' : '解锁相册'}
          </button>
          <p className="flex items-center justify-center gap-1 text-[10px] text-white/35">
            <Sparkles className="w-3 h-3 text-amber-200/60" />
            解锁后即可进入 360° 银河唱片空间
          </p>
        </form>
      </div>
    </div>
  )
}
