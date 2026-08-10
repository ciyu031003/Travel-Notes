'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  Lock, Mail, ArrowLeft, Eye, EyeOff, Loader2, 
  CheckCircle2, XCircle, KeyRound
} from 'lucide-react'

type StepType = 'request' | 'verify' | 'reset'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<StepType>('request')
  
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' })

  const evaluatePassword = (password: string) => {
    if (!password) {
      setPasswordStrength({ score: 0, label: '', color: '' })
      return
    }
    let score = 0
    if (password.length >= 6) score++
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    const levels = [
      { score: 0, label: '', color: '' },
      { score: 1, label: '太弱', color: 'bg-red-500' },
      { score: 2, label: '弱', color: 'bg-orange-500' },
      { score: 3, label: '中等', color: 'bg-yellow-500' },
      { score: 4, label: '强', color: 'bg-green-500' },
      { score: 5, label: '非常强', color: 'bg-green-600' },
    ]
    setPasswordStrength(levels[Math.min(score, 5)])
  }

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setMessage(null)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: 'error', text: '请输入有效的邮箱地址' })
      return
    }

    setSendingCode(true)
    try {
      const res = await fetch('/api/forgot-password/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (res.ok) {
        const data = await res.json()
        setCountdown(60)
        setStep('verify')
        setMessage({
          type: 'success',
          text: data.message || `验证码已发送到 ${email}，请查收`,
        })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '发送失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setSendingCode(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!code || code.length !== 6) {
      setMessage({ type: 'error', text: '请输入 6 位验证码' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/forgot-password/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      })

      if (res.ok) {
        setStep('reset')
        setMessage({ type: 'success', text: '验证码验证成功，请设置新密码' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '验证码错误' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!newPassword || newPassword.length < 6) {
      setMessage({ type: 'error', text: '密码至少需要 6 位字符' })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的密码不一致' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code,
          newPassword,
        }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: '密码重置成功！即将跳转到登录页面...' })
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '重置失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFBF7] relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#F5DCE0]/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#D6E8F0]/40 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-[#D8DDD8]/60">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-2xl flex items-center justify-center mx-auto mb-4">
              {step === 'request' && <KeyRound className="w-8 h-8 text-[#3D4852]" />}
              {step === 'verify' && <Mail className="w-8 h-8 text-[#3D4852]" />}
              {step === 'reset' && <Lock className="w-8 h-8 text-[#3D4852]" />}
            </div>
            <h1 className="text-2xl font-bold text-[#3D4852]">找回密码</h1>
            <p className="text-[#3D4852]/70 text-sm mt-2">
              {step === 'request' && '输入绑定的邮箱，发送验证码重置密码'}
              {step === 'verify' && '请查看邮箱中的验证码'}
              {step === 'reset' && '设置您的新密码'}
            </p>
          </div>

          {message && (
            <div
              className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {step === 'request' && (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#3D4852] mb-2">邮箱地址</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3D4852]/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white/60 border border-[#D8DDD8] rounded-xl text-[#3D4852] placeholder-[#3D4852]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2] focus:border-transparent"
                    placeholder="请输入绑定的邮箱"
                    required
                  />
                </div>
                <p className="mt-2 text-xs text-[#3D4852]/60">
                  如果您的账号未绑定邮箱，请联系管理员或等待管理员重置密码。
                </p>
              </div>

              <button
                type="submit"
                disabled={sendingCode || countdown > 0}
                className="w-full py-3 bg-gradient-to-r from-[#3D4852] to-[#3D4852]/90 text-[#FAFBF7] font-semibold rounded-xl hover:from-[#3D4852]/90 hover:to-[#3D4852]/80 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingCode && <Loader2 className="w-4 h-4 animate-spin" />}
                {countdown > 0 ? `${countdown} 秒后重试` : '发送验证码'}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#3D4852] mb-2">验证码</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  className="w-full px-4 py-3 bg-white/60 border border-[#D8DDD8] rounded-xl text-[#3D4852] placeholder-[#3D4852]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2] focus:border-transparent text-center text-xl tracking-widest"
                  placeholder="请输入 6 位验证码"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('request')}
                  className="flex-1 py-3 bg-white/60 text-[#3D4852] font-medium rounded-xl border border-[#D8DDD8] hover:bg-white transition-colors"
                >
                  返回
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-[#3D4852] to-[#3D4852]/90 text-[#FAFBF7] font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  验证并继续
                </button>
              </div>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#3D4852] mb-2">新密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3D4852]/40" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      evaluatePassword(e.target.value)
                    }}
                    className="w-full pl-10 pr-12 py-3 bg-white/60 border border-[#D8DDD8] rounded-xl text-[#3D4852] placeholder-[#3D4852]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2] focus:border-transparent"
                    placeholder="至少 6 位字符"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3D4852]/40 hover:text-[#3D4852] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {passwordStrength.score > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full ${
                            i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-[#3D4852]/60">
                      密码强度：<span className="font-medium">{passwordStrength.label}</span>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#3D4852] mb-2">确认新密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3D4852]/40" />
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-white/60 border border-[#D8DDD8] rounded-xl text-[#3D4852] placeholder-[#3D4852]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2] focus:border-transparent"
                    placeholder="再次输入新密码"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3D4852]/40 hover:text-[#3D4852] transition-colors"
                  >
                    {showConfirmPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('verify')}
                  className="flex-1 py-3 bg-white/60 text-[#3D4852] font-medium rounded-xl border border-[#D8DDD8] hover:bg-white transition-colors"
                  disabled={loading}
                >
                  返回
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-[#3D4852] to-[#3D4852]/90 text-[#FAFBF7] font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  重置密码
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-[#3D4852]/70 hover:text-[#3D4852] text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回登录
            </Link>
          </div>
        </div>

        <p className="text-center text-[#3D4852]/40 text-xs mt-6">
          © {new Date().getFullYear()} 个人博客 · 旅行记录 & 学习笔记
        </p>
      </div>
    </div>
  )
}
