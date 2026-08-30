'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, User, Key, Mail, Save, Eye, EyeOff,
  CheckCircle2, XCircle, Loader2, Shield, ExternalLink, Home, Heart, Calendar, Settings, Palette, AlertTriangle
} from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'

type TabType = 'profile' | 'password' | 'email' | 'travel' | 'paint'

export default function AdminSettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

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
      } else {
        setLoading(false)
      }
    } catch {
      router.push('/admin/login')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <AdminShell title="账号设置">
      <main className="mx-auto max-w-4xl px-1 py-2">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex -mb-px" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('profile')}
                className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'profile'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <User className="w-4 h-4 inline mr-2" />
                基本信息
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'password'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Key className="w-4 h-4 inline mr-2" />
                修改密码
              </button>
              <button
                onClick={() => setActiveTab('email')}
                className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'email'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Mail className="w-4 h-4 inline mr-2" />
                邮箱绑定
              </button>
              <button
                onClick={() => setActiveTab('travel')}
                className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'travel'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Heart className="w-4 h-4 inline mr-2" />
                旅行设置
              </button>
              <button
                onClick={() => setActiveTab('paint')}
                className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'paint'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Palette className="w-4 h-4 inline mr-2" />
                油画生成
              </button>
            </nav>
          </div>

          <div className="p-6">
            {message && (
              <div
                className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                    : message.type === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : message.type === 'error' ? (
                  <XCircle className="w-4 h-4" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {activeTab === 'profile' && (
              <ProfileTab onMessage={setMessage} />
            )}
            {activeTab === 'password' && (
              <PasswordTab onMessage={setMessage} />
            )}
            {activeTab === 'email' && (
              <EmailTab onMessage={setMessage} />
            )}
            {activeTab === 'travel' && (
              <TravelTab onMessage={setMessage} />
            )}
            {activeTab === 'paint' && (
              <OilTab onMessage={setMessage} />
            )}
          </div>
        </div>

        <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">安全提示</p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                请妥善保管您的账号信息。绑定邮箱后，可通过邮箱验证找回密码。所有账号修改操作都会验证当前密码。
              </p>
            </div>
          </div>
        </div>
      </main>
    </AdminShell>
  )
}

function ProfileTab({ onMessage }: { onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void }) {
  const [currentUsername, setCurrentUsername] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    loadCurrentSettings()
  }, [])

  const loadCurrentSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings')
      if (res.ok) {
        const data = await res.json()
        setCurrentUsername(data.username)
        setNewUsername(data.username)
      }
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    onMessage(null)

    if (!newUsername.trim()) {
      onMessage({ type: 'error', text: '用户名不能为空' })
      return
    }

    if (!currentPassword) {
      onMessage({ type: 'error', text: '请输入当前密码以验证身份' })
      return
    }

    if (newUsername === currentUsername) {
      onMessage({ type: 'info', text: '用户名未改变' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newUsername: newUsername.trim(),
          currentPassword,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setCurrentUsername(data.username)
        setNewUsername(data.username)
        setCurrentPassword('')
        onMessage({ type: 'success', text: '用户名修改成功！' })
      } else {
        const data = await res.json()
        onMessage({ type: 'error', text: data.error || '修改失败' })
      }
    } catch {
      onMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">基本信息</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">修改您的登录用户名</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          当前用户名
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={currentUsername}
            disabled
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          新用户名
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="输入新的用户名"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          当前密码 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full pl-10 pr-12 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="必须输入当前密码以验证身份"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          修改用户名需要验证您的当前密码
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? '保存中...' : '保存修改'}
        </button>
      </div>
    </form>
  )
}

function PasswordTab({ onMessage }: { onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    onMessage(null)

    if (!currentPassword) {
      onMessage({ type: 'error', text: '请输入当前密码' })
      return
    }

    if (!newPassword || newPassword.length < 6) {
      onMessage({ type: 'error', text: '新密码至少需要 6 位字符' })
      return
    }

    if (newPassword !== confirmPassword) {
      onMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }

    if (newPassword === currentPassword) {
      onMessage({ type: 'error', text: '新密码不能与当前密码相同' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (res.ok) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPasswordStrength({ score: 0, label: '', color: '' })
        onMessage({ type: 'success', text: '密码修改成功！下次登录时请使用新密码。' })
      } else {
        const data = await res.json()
        onMessage({ type: 'error', text: data.error || '修改失败' })
      }
    } catch {
      onMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">修改密码</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">定期更换密码有助于保护账号安全</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          当前密码 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type={showCurrentPwd ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full pl-10 pr-12 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="输入当前密码"
            required
          />
          <button
            type="button"
            onClick={() => setShowCurrentPwd(!showCurrentPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          新密码 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type={showNewPwd ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              evaluatePassword(e.target.value)
            }}
            className="w-full pl-10 pr-12 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="至少 6 位字符"
            required
          />
          <button
            type="button"
            onClick={() => setShowNewPwd(!showNewPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {passwordStrength.score > 0 && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              密码强度：<span className="font-medium">{passwordStrength.label}</span>
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          确认新密码 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type={showConfirmPwd ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full pl-10 pr-12 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="再次输入新密码"
            required
          />
          <button
            type="button"
            onClick={() => setShowConfirmPwd(!showConfirmPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? '保存中...' : '更新密码'}
        </button>
      </div>
    </form>
  )
}

function EmailTab({ onMessage }: { onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void }) {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    loadCurrentEmail()
  }, [])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const loadCurrentEmail = async () => {
    try {
      const res = await fetch('/api/admin/settings/email')
      if (res.ok) {
        const data = await res.json()
        setCurrentEmail(data.email)
        setEmailVerified(data.emailVerified)
      }
    } catch {}
  }

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const handleSendCode = async () => {
    onMessage(null)

    if (!isValidEmail(newEmail)) {
      onMessage({ type: 'error', text: '请输入有效的邮箱地址' })
      return
    }

    setSendingCode(true)
    try {
      const res = await fetch('/api/admin/settings/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() }),
      })

      if (res.ok) {
        const data = await res.json()
        setCodeSent(true)
        setCountdown(60)
        onMessage({
          type: 'info',
          text: data.message || `验证码已发送到 ${newEmail}，请在 5 分钟内使用`,
        })
      } else {
        const data = await res.json()
        onMessage({ type: 'error', text: data.error || '发送失败' })
      }
    } catch {
      onMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setSendingCode(false)
    }
  }

  const handleBindEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    onMessage(null)

    if (!isValidEmail(newEmail)) {
      onMessage({ type: 'error', text: '请输入有效的邮箱地址' })
      return
    }

    if (!verificationCode || verificationCode.length !== 6) {
      onMessage({ type: 'error', text: '请输入 6 位验证码' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/bind-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          code: verificationCode,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setCurrentEmail(data.email)
        setEmailVerified(data.emailVerified)
        setNewEmail('')
        setVerificationCode('')
        setCodeSent(false)
        onMessage({ type: 'success', text: '邮箱绑定成功！' })
      } else {
        const data = await res.json()
        onMessage({ type: 'error', text: data.error || '绑定失败' })
      }
    } catch {
      onMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  const handleUnbindEmail = async () => {
    onMessage(null)
    if (!window.confirm('确定要解除绑定的邮箱吗？解除后将无法通过邮箱找回密码。')) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/email', {
        method: 'DELETE',
      })

      if (res.ok) {
        setCurrentEmail(null)
        setEmailVerified(false)
        onMessage({ type: 'success', text: '邮箱已解除绑定' })
      } else {
        const data = await res.json()
        onMessage({ type: 'error', text: data.error || '操作失败' })
      }
    } catch {
      onMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">邮箱绑定</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">绑定邮箱后，可通过邮箱找回密码</p>
      </div>

      {currentEmail ? (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{currentEmail}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                      已验证
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <XCircle className="w-3 h-3" />
                      未验证
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleUnbindEmail}
              className="text-sm text-red-500 hover:text-red-600 transition-colors"
            >
              解除绑定
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            尚未绑定邮箱。绑定邮箱后，忘记密码时可通过邮箱验证找回。
          </p>
        </div>
      )}

      <form onSubmit={handleBindEmail} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            邮箱地址
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="example@email.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            验证码
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
              className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="6 位验证码"
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || countdown > 0}
              className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}s 后重试` : '发送验证码'}
            </button>
          </div>
          {codeSent && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              验证码将发送到您填写的邮箱（演示环境：验证码为 123456）
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {loading ? '绑定中...' : '绑定邮箱'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TravelTab({ onMessage }: { onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void }) {
  const [anniversaryStart, setAnniversaryStart] = useState<string>('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [calculatedDays, setCalculatedDays] = useState<number | null>(null)

  useEffect(() => {
    loadCurrentSettings()
  }, [])

  useEffect(() => {
    if (anniversaryStart) {
      const start = new Date(anniversaryStart)
      if (!isNaN(start.getTime())) {
        const now = new Date()
        const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
        setCalculatedDays(days)
      } else {
        setCalculatedDays(null)
      }
    } else {
      setCalculatedDays(null)
    }
  }, [anniversaryStart])

  const loadCurrentSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings/anniversary')
      if (res.ok) {
        const data = await res.json()
        setAnniversaryStart(data.anniversaryStart || '')
      }
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    onMessage(null)

    if (!currentPassword) {
      onMessage({ type: 'error', text: '请输入当前密码以验证身份' })
      return
    }

    if (anniversaryStart && !/^\d{4}-\d{2}-\d{2}$/.test(anniversaryStart)) {
      onMessage({ type: 'error', text: '日期格式不正确' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/anniversary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anniversaryStart: anniversaryStart || null,
          currentPassword,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAnniversaryStart(data.anniversaryStart || '')
        setCurrentPassword('')
        onMessage({ type: 'success', text: '旅行设置保存成功！' })
      } else {
        const data = await res.json()
        onMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      onMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">旅行设置</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">设置纪念日开始日期，旅行地图页面将自动计算天数</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          纪念日
        </label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={anniversaryStart}
            onChange={(e) => setAnniversaryStart(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="选择日期"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          选择开始日期，系统将自动计算天数
        </p>
      </div>

      {calculatedDays !== null && (
        <div className="bg-gradient-to-r from-travel-sakura to-travel-mist dark:from-travel-accent/20 dark:to-travel-sky/10 rounded-xl p-4 border border-travel-bloom/40 dark:border-travel-accent/30">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4 text-travel-accent" />
            <span className="text-sm font-medium text-travel-ink dark:text-gray-300">预览效果</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {calculatedDays}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">天</span>
            <span className="text-xs text-gray-500 dark:text-gray-500 ml-2">
              从 {anniversaryStart} 开始
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          当前密码 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full pl-10 pr-12 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="必须输入当前密码以验证身份"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? '保存中...' : '保存设置'}
        </button>
        {anniversaryStart && (
          <button
            type="button"
            onClick={() => {
              setAnniversaryStart('')
              setCalculatedDays(null)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm rounded-lg transition-colors"
          >
            清除
          </button>
        )}
      </div>
    </form>
  )
}

// ============================================================
// 油画生成设置：总开关（AppSecret: OIL_PAINT_ENABLED，未设置回退环境变量）
// + 通义 API key 管理（AppSecret 加密落库，GET 只回打码掩码）
// ============================================================
interface OilStatus {
  encryptionConfigured: boolean
  enabled: boolean
  enabledSource: 'db' | 'env'
  hasKey: boolean
  keyMasked: string | null
}

function OilTab({ onMessage }: { onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void }) {
  const [status, setStatus] = useState<OilStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/admin/settings/oil')
      if (!res.ok) throw new Error()
      setStatus(await res.json())
    } catch {
      onMessage({ type: 'error', text: '油画设置读取失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (payload: Record<string, unknown>, okText: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings/oil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '保存失败')
      setStatus(data)
      setApiKey('')
      onMessage({ type: 'success', text: okText })
    } catch (e) {
      onMessage({ type: 'error', text: (e as Error)?.message || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {status && !status.encryptionConfigured && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>服务器未配置 APP_ENCRYPTION_KEY，无法保存油画设置（含 API key）。请先在服务器 .env 配置该密钥。</span>
        </div>
      )}

      {/* 开关 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">照片转油画</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              开启后，画册阅读器里的照片可按需生成油画版（通义 wanx2.1-imageedit，按张计费，生成结果缓存、每张只生成一次）。
              {status?.enabledSource === 'env' && '（当前开关来自服务器环境变量，保存后改为后台管理）'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!status?.enabled}
            disabled={saving || !status?.encryptionConfigured}
            onClick={() => save({ enabled: !status?.enabled }, status?.enabled ? '已关闭油画生成' : '已开启油画生成')}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              status?.enabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                status?.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* API key */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <p className="font-medium text-gray-900 dark:text-white">通义 API Key（DashScope）</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          以 AES-256-GCM 加密存入数据库，保存后不再回显完整 key。
          {status?.hasKey ? ` 当前已配置：${status.keyMasked}` : ' 当前未配置。'}
        </p>
        <div className="mt-3 relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="粘贴新的 API key（sk-...）"
            autoComplete="off"
            maxLength={200}
            className="w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={showKey ? '隐藏 key' : '显示 key'}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={saving || !apiKey.trim() || !status?.encryptionConfigured}
            onClick={() => save({ apiKey }, 'API key 已更新')}
            className="inline-flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存 Key'}
          </button>
          {status?.hasKey && (
            <button
              type="button"
              disabled={saving || !status?.encryptionConfigured}
              onClick={() => save({ clearKey: true }, 'API key 已清除')}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              清除 Key
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
