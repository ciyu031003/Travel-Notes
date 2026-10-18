'use client'

import { useState } from 'react'
import { evaluatePassword, type PasswordStrength } from '@/lib/validators/password'
import { FormSection, PasswordField, SubmitButton } from './fields'
import type { SettingsTabProps } from './types'

/**
 * 修改密码 Tab（P2-32 拆分）。
 *
 * 行为/文案/接口与拆分前完全一致：POST /api/admin/settings/password
 * { currentPassword, newPassword }（P0 后改密不再走旧端点，但仍校验当前密码）。
 *
 * 强度条：评分算法抽到 lib/validators/password.ts（沿用原启发式规则），
 * 并额外用服务端 validatePassword 给「无效密码」封顶到「弱」——只影响提示，
 * 不做提交前拦截（提交仍由接口判定，与原行为一致）。
 */
const STRENGTH_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-green-500',
  5: 'bg-green-600',
}

export default function PasswordTab({ onMessage }: SettingsTabProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>(() => evaluatePassword(''))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    onMessage(null)

    if (!currentPassword) {
      onMessage({ type: 'error', text: '请输入当前密码' })
      return
    }
    if (!newPassword || newPassword.length < 8) {
      onMessage({ type: 'error', text: '新密码至少需要 8 位字符' })
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
        setPasswordStrength(evaluatePassword(''))
        onMessage({ type: 'success', text: '密码修改成功！下次登录时请使用新密码。' })
      } else {
        const data = (await res.json()) as { error?: string }
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
      <FormSection title="修改密码" description="定期更换密码有助于保护账号安全" />

      <PasswordField
        label="当前密码"
        value={currentPassword}
        onChange={setCurrentPassword}
        show={showCurrentPwd}
        onToggle={() => setShowCurrentPwd(!showCurrentPwd)}
        placeholder="输入当前密码"
        autoComplete="current-password"
        required
      />

      <div>
        <PasswordField
          label="新密码"
          value={newPassword}
          onChange={(value) => {
            setNewPassword(value)
            setPasswordStrength(evaluatePassword(value))
          }}
          show={showNewPwd}
          onToggle={() => setShowNewPwd(!showNewPwd)}
          placeholder="至少 8 位字符"
          autoComplete="new-password"
          required
        />
        {passwordStrength.score > 0 && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i <= passwordStrength.score ? STRENGTH_COLORS[passwordStrength.score] : 'bg-warm-200 dark:bg-warm-600'
                  }`}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">
              密码强度：<span className="font-medium">{passwordStrength.label}</span>
            </p>
          </div>
        )}
      </div>

      <PasswordField
        label="确认新密码"
        value={confirmPassword}
        onChange={setConfirmPassword}
        show={showConfirmPwd}
        onToggle={() => setShowConfirmPwd(!showConfirmPwd)}
        placeholder="再次输入新密码"
        autoComplete="new-password"
        required
      />

      <SubmitButton loading={loading} label="更新密码" />
    </form>
  )
}
