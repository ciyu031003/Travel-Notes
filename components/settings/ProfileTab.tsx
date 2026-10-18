'use client'

import { useEffect, useState } from 'react'
import { NAV_ICON } from '@/lib/mobile/icon-system'
import { FormSection, PasswordField, SubmitButton, TextField } from './fields'
import type { SettingsTabProps } from './types'

/**
 * 基本信息 Tab（P2-32 拆分）：改登录用户名。
 * 行为/文案/接口与拆分前 ProfileTab 完全一致：
 *  · GET /api/admin/settings 回填当前用户名
 *  · POST /api/admin/settings/username { newUsername, currentPassword }
 */
export default function ProfileTab({ onMessage }: SettingsTabProps) {
  const [currentUsername, setCurrentUsername] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const loadCurrentSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings')
        if (res.ok) {
          const data = (await res.json()) as { username?: string }
          setCurrentUsername(data.username ?? '')
          setNewUsername(data.username ?? '')
        }
      } catch {
        // 读取失败不提示：保持原行为（输入框留空，用户可手填）
      }
    }
    void loadCurrentSettings()
  }, [])

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
        const data = (await res.json()) as { username: string }
        setCurrentUsername(data.username)
        setNewUsername(data.username)
        setCurrentPassword('')
        onMessage({ type: 'success', text: '用户名修改成功！' })
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
      <FormSection title="基本信息" description="修改您的登录用户名" />

      <TextField label="当前用户名" value={currentUsername} icon={NAV_ICON.me} disabled />

      <TextField
        label="新用户名"
        value={newUsername}
        onChange={setNewUsername}
        icon={NAV_ICON.me}
        placeholder="输入新的用户名"
      />

      <PasswordField
        label="当前密码"
        value={currentPassword}
        onChange={setCurrentPassword}
        show={showPassword}
        onToggle={() => setShowPassword(!showPassword)}
        placeholder="必须输入当前密码以验证身份"
        hint="修改用户名需要验证您的当前密码"
        autoComplete="current-password"
        required
      />

      <SubmitButton loading={loading} label="保存修改" />
    </form>
  )
}
