'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, Eye, EyeOff, Key, User, X } from 'lucide-react'

export default function AccountSettings() {
  const [currentUsername, setCurrentUsername] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

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
    setMessage(null)

    if (!currentPassword) {
      setMessage({ type: 'error', text: '请输入当前密码' })
      return
    }

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }

    if (newPassword && newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少需要 6 位字符' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername !== currentUsername ? newUsername : undefined,
          newPassword: newPassword || undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setCurrentUsername(data.username)
        setNewUsername(data.username)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setMessage({ type: 'success', text: '账号信息更新成功！' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '更新失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-shell-surface rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-travel-accent to-travel-accentSoft rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-travel-inkStrong dark:text-shell-text">账号设置</h2>
          <p className="text-sm text-travel-sand dark:text-shell-muted">修改登录账号和密码（与本站访问密码一致）</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-travel-ink dark:text-shell-text mb-2">
            <User className="w-4 h-4 inline mr-2" />
            用户名
          </label>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="w-full px-4 py-2.5 bg-travel-cream dark:bg-shell-surface2 border border-travel-line dark:border-shell-line rounded-lg text-travel-inkStrong dark:text-shell-text focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
            placeholder="输入新的用户名"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-travel-ink dark:text-shell-text mb-2">
            <Key className="w-4 h-4 inline mr-2" />
            当前密码
          </label>
          <div className="relative">
            <input
              type={showCurrentPwd ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2.5 pr-12 bg-travel-cream dark:bg-shell-surface2 border border-travel-line dark:border-shell-line rounded-lg text-travel-inkStrong dark:text-shell-text focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
              placeholder="必须输入当前密码以验证身份"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrentPwd(!showCurrentPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-travel-sand/70 hover:text-travel-ink"
            >
              {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="border-t border-travel-line dark:border-shell-line pt-6">
          <p className="text-sm text-travel-sand dark:text-shell-muted mb-4">
            如需修改密码，请填写以下字段；留空则表示不修改密码。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-travel-ink dark:text-shell-text mb-2">
                新密码
              </label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-12 bg-travel-cream dark:bg-shell-surface2 border border-travel-line dark:border-shell-line rounded-lg text-travel-inkStrong dark:text-shell-text focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
                  placeholder="至少 6 位字符（留空则不修改）"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-travel-sand/70 hover:text-travel-ink"
                >
                  {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-travel-ink dark:text-shell-text mb-2">
                确认新密码
              </label>
              <div className="relative">
                <input
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-12 bg-travel-cream dark:bg-shell-surface2 border border-travel-line dark:border-shell-line rounded-lg text-travel-inkStrong dark:text-shell-text focus:outline-none focus:ring-2 focus:ring-travel-accentSoft"
                  placeholder="再次输入新密码"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-travel-sand/70 hover:text-travel-ink"
                >
                  {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}
          >
            {message.type === 'success' ? (
              <Save className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-travel-accent hover:bg-travel-accentStrong text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? '保存中...' : '保存修改'}
        </button>
      </form>
    </div>
  )
}