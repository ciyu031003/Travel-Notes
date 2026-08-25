'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react'

export default function ForceChangePasswordPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/admin/check')
      if (!res.ok) {
        router.push('/admin/login')
        return
      }
      const data = await res.json()
      if (!data.authenticated) {
        router.push('/admin/login')
      }
    } catch {
      router.push('/admin/login')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/force-change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      })

      if (res.ok) {
        setSuccess(true)
        setTimeout(() => {
          router.push('/admin')
        }, 1500)
      } else {
        const data = await res.json()
        setError(data.error || '修改失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-travel-cream dark:bg-[#121316]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 w-full max-w-md mx-4">
          <div className="rounded-3xl border border-white/70 bg-white/85 p-8 shadow-[0_30px_80px_rgba(90,102,112,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#16181C]/90 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-[#2D3842] dark:text-[#F1EFEA] mb-2">密码修改成功</h1>
            <p className="text-sm text-travel-ink/80 dark:text-shell-muted">正在跳转到管理后台...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-travel-cream dark:bg-[#121316]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="rounded-3xl border border-white/70 bg-white/85 p-8 shadow-[0_30px_80px_rgba(90,102,112,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#16181C]/90">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-[#2D3842] dark:text-[#F1EFEA]">首次登录请修改密码</h1>
            <p className="text-sm text-travel-ink/80 dark:text-shell-muted mt-2">
              您正在使用初始密码，请设置一个新密码以确保账户安全
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block mb-2 block text-sm font-medium text-travel-ink dark:text-shell-muted">新密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9A958F]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-travel-line bg-white/70 py-3 pl-11 pr-12 text-[#3D4852] transition-all placeholder-[#9A958F] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/50 dark:border-shell-line dark:bg-shell-surface2/80 dark:text-shell-text dark:placeholder-[#6E6A64]"
                  placeholder="至少 6 位"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A958F] transition-colors hover:text-travel-accent"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block mb-2 block text-sm font-medium text-travel-ink dark:text-shell-muted">确认新密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9A958F]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-travel-line bg-white/70 py-3 pl-11 pr-4 text-[#3D4852] transition-all placeholder-[#9A958F] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/50 dark:border-shell-line dark:bg-shell-surface2/80 dark:text-shell-text dark:placeholder-[#6E6A64]"
                  placeholder="再次输入新密码"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-travel-bloom/50 bg-travel-sakura/40 px-4 py-3 text-sm text-travel-accent dark:border-[#4A3427] dark:bg-[#32261D]/70 dark:text-travel-bloom">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-travel-accent to-travel-accentSoft py-3 font-semibold text-white shadow-lg shadow-travel-accent/25 transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? '修改中...' : '确认修改并进入后台'}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-center text-xs text-[#9A958F] dark:text-shell-faint">
          为了您的账户安全，初始密码首次登录必须修改
        </p>
      </div>
    </div>
  )
}
