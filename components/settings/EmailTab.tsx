'use client'

import { useEffect, useState } from 'react'
import { Mail } from '@/lib/mobile/icon-system'
import { FormSection, SubmitButton, TextField } from './fields'
import EmailStatusCard from './EmailStatusCard'
import type { SettingsTabProps } from './types'

/**
 * 邮箱绑定 Tab（P2-32 拆分）。行为/文案/接口与拆分前完全一致：
 *  · GET    /api/admin/settings/email（读当前邮箱）
 *  · POST   /api/admin/settings/send-code { email }
 *  · POST   /api/admin/settings/bind-email { email, code }
 *  · DELETE /api/admin/settings/email（解绑，先 window.confirm）
 * 60s 倒计时与「演示环境验证码」提示均保留。
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EmailTab({ onMessage }: SettingsTabProps) {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    const loadCurrentEmail = async () => {
      try {
        const res = await fetch('/api/admin/settings/email')
        if (res.ok) {
          const data = (await res.json()) as { email?: string | null; emailVerified?: boolean }
          setCurrentEmail(data.email ?? null)
          setEmailVerified(Boolean(data.emailVerified))
        }
      } catch {
        // 读取失败不提示：保持原行为
      }
    }
    void loadCurrentEmail()
  }, [])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const isValidEmail = (email: string) => EMAIL_RE.test(email)

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
        const data = (await res.json()) as { message?: string }
        setCodeSent(true)
        setCountdown(60)
        onMessage({
          type: 'info',
          text: data.message || `验证码已发送到 ${newEmail}，请在 5 分钟内使用`,
        })
      } else {
        const data = (await res.json()) as { error?: string }
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
        const data = (await res.json()) as { email?: string | null; emailVerified?: boolean }
        setCurrentEmail(data.email ?? null)
        setEmailVerified(Boolean(data.emailVerified))
        setNewEmail('')
        setVerificationCode('')
        setCodeSent(false)
        onMessage({ type: 'success', text: '邮箱绑定成功！' })
      } else {
        const data = (await res.json()) as { error?: string }
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
      const res = await fetch('/api/admin/settings/email', { method: 'DELETE' })
      if (res.ok) {
        setCurrentEmail(null)
        setEmailVerified(false)
        onMessage({ type: 'success', text: '邮箱已解除绑定' })
      } else {
        const data = (await res.json()) as { error?: string }
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
      <FormSection title="邮箱绑定" description="绑定邮箱后，可通过邮箱找回密码" />

      <EmailStatusCard email={currentEmail} verified={emailVerified} onUnbind={() => void handleUnbindEmail()} />

      <form onSubmit={handleBindEmail} className="space-y-4">
        <TextField
          label="邮箱地址"
          type="email"
          value={newEmail}
          onChange={setNewEmail}
          icon={Mail}
          placeholder="example@email.com"
        />

        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">验证码</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
              placeholder="6 位验证码"
              className="flex-1 px-4 py-2.5 bg-warm-50 dark:bg-warm-700 border border-warm-300 dark:border-warm-600 rounded-lg text-warm-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            />
            <button
              type="button"
              onClick={() => void handleSendCode()}
              disabled={sendingCode || countdown > 0}
              className="px-4 py-2.5 bg-warm-100 hover:bg-warm-200 dark:bg-warm-600 dark:hover:bg-warm-500 text-warm-700 dark:text-warm-200 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}s 后重试` : '发送验证码'}
            </button>
          </div>
          {codeSent && (
            <p className="mt-2 text-xs text-warm-500 dark:text-warm-400">
              验证码将发送到您填写的邮箱（演示环境：验证码为 123456）
            </p>
          )}
        </div>

        <SubmitButton loading={loading} label="绑定邮箱" busyLabel="绑定中..." />
      </form>
    </div>
  )
}
