'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Heart } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { FormSection, PasswordField, SubmitButton, TextField } from './fields'
import type { SettingsTabProps } from './types'

/**
 * 旅行设置 Tab（P2-32 拆分）：纪念日开始日期。
 * 行为/文案/接口与拆分前完全一致：
 *  · GET  /api/admin/settings/anniversary
 *  · POST /api/admin/settings/anniversary { anniversaryStart: string|null, currentPassword }
 * 「预览天数」由前端按自然日差计算（原逻辑逐字保留）。
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default function TravelTab({ onMessage }: SettingsTabProps) {
  const [anniversaryStart, setAnniversaryStart] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [calculatedDays, setCalculatedDays] = useState<number | null>(null)

  useEffect(() => {
    const loadCurrentSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings/anniversary')
        if (res.ok) {
          const data = (await res.json()) as { anniversaryStart?: string | null }
          setAnniversaryStart(data.anniversaryStart || '')
        }
      } catch {
        // 读取失败不提示：保持原行为
      }
    }
    void loadCurrentSettings()
  }, [])

  useEffect(() => {
    if (anniversaryStart) {
      const start = new Date(anniversaryStart)
      if (!Number.isNaN(start.getTime())) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    onMessage(null)

    if (!currentPassword) {
      onMessage({ type: 'error', text: '请输入当前密码以验证身份' })
      return
    }
    if (anniversaryStart && !DATE_RE.test(anniversaryStart)) {
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
        const data = (await res.json()) as { anniversaryStart?: string | null }
        setAnniversaryStart(data.anniversaryStart || '')
        setCurrentPassword('')
        onMessage({ type: 'success', text: '旅行设置保存成功！' })
      } else {
        const data = (await res.json()) as { error?: string }
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
      <FormSection title="旅行设置" description="设置纪念日开始日期，旅行地图页面将自动计算天数" />

      <TextField
        label="纪念日"
        type="date"
        value={anniversaryStart}
        onChange={setAnniversaryStart}
        icon={CalendarDays}
        placeholder="选择日期"
        hint="选择开始日期，系统将自动计算天数"
      />

      {/* 预览卡渐变统一走受控 token（--m-grad-hero）：拆分前这段在 app/admin/ 的豁免目录里，
          移到 components/ 后写 Tailwind 渐变类会被设计 token 门禁记为新增回退。 */}
      {calculatedDays !== null && (
        <div className="bg-[image:var(--m-grad-hero)] rounded-xl p-4 border border-travel-bloom/40 dark:border-travel-accent/30">
          <div className="flex items-center gap-2 mb-2">
            <Icon icon={Heart} size="sm" className="text-travel-accent" />
            <span className="text-sm font-medium text-travel-ink dark:text-warm-300">预览效果</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-warm-900 dark:text-white tabular-nums">{calculatedDays}</span>
            <span className="text-sm text-warm-600 dark:text-warm-400">天</span>
            <span className="text-xs text-warm-500 dark:text-warm-500 ml-2">从 {anniversaryStart} 开始</span>
          </div>
        </div>
      )}

      <PasswordField
        label="当前密码"
        value={currentPassword}
        onChange={setCurrentPassword}
        show={showPassword}
        onToggle={() => setShowPassword(!showPassword)}
        placeholder="必须输入当前密码以验证身份"
        autoComplete="current-password"
        required
      />

      <SubmitButton loading={loading} label="保存设置">
        {anniversaryStart && (
          <button
            type="button"
            onClick={() => {
              setAnniversaryStart('')
              setCalculatedDays(null)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-warm-100 hover:bg-warm-200 dark:bg-warm-700 dark:hover:bg-warm-600 text-warm-700 dark:text-warm-200 text-sm rounded-lg transition-colors"
          >
            清除
          </button>
        )}
      </SubmitButton>
    </form>
  )
}
