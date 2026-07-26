'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, User, Eye, EyeOff } from 'lucide-react'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/check-auth')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          router.push(redirect)
        }
      }
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        router.push(redirect)
      } else {
        const data = await res.json()
        setError(data.error || '登录失败')
      }
    } catch {
      setError('网络错误，请重试')
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
              <Lock className="w-8 h-8 text-[#3D4852]" />
            </div>
            <h1 className="text-2xl font-bold text-[#3D4852]">访问验证</h1>
            <p className="text-[#3D4852]/70 text-sm mt-2">
              请输入账号密码以浏览本站内容
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#3D4852] mb-2">用户名</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3D4852]/40" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/60 border border-[#D8DDD8] rounded-xl text-[#3D4852] placeholder-[#3D4852]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2] focus:border-transparent"
                  placeholder="请输入用户名"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#3D4852] mb-2">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3D4852]/40" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-white/60 border border-[#D8DDD8] rounded-xl text-[#3D4852] placeholder-[#3D4852]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2] focus:border-transparent"
                  placeholder="请输入密码"
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
            </div>

            {error && (
              <div className="px-4 py-3 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 rounded-xl text-[#3D4852] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#3D4852] to-[#3D4852]/90 text-[#FAFBF7] font-semibold rounded-xl hover:from-[#3D4852]/90 hover:to-[#3D4852]/80 transition-all disabled:opacity-50"
            >
              {loading ? '登录中...' : '进入本站'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <a
              href="/forgot-password"
              className="block text-[#3D4852]/60 hover:text-[#3D4852] text-sm transition-colors"
            >
              忘记密码？
            </a>
            <a
              href="/admin/login"
              className="block text-[#3D4852]/60 hover:text-[#3D4852] text-sm transition-colors"
            >
              管理员入口 →
            </a>
          </div>
        </div>

        <p className="text-center text-[#3D4852]/40 text-xs mt-6">
          © {new Date().getFullYear()} 个人博客 · 旅行记录 & 学习笔记
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAFBF7]">
        <p className="text-[#3D4852]/60">加载中...</p>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}