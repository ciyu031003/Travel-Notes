'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2, Save } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import type { SettingsTabProps } from './types'

/**
 * 油画生成 Tab（P2-32 拆分）。
 * 行为/文案/接口与拆分前完全一致：
 *  · GET /api/admin/settings/oil（读取开关/加密配置/key 掩码）
 *  · PUT /api/admin/settings/oil（{ enabled } | { apiKey } | { clearKey: true }）
 * 未配置 APP_ENCRYPTION_KEY 时保持红色告警并禁用保存。
 */
interface OilStatus {
  encryptionConfigured: boolean
  enabled: boolean
  enabledSource: 'db' | 'env'
  hasKey: boolean
  keyMasked: string | null
}

type OilResponse = Partial<OilStatus> & { error?: string }

export default function OilTab({ onMessage }: SettingsTabProps) {
  const [status, setStatus] = useState<OilStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/admin/settings/oil')
      if (!res.ok) throw new Error('读取失败')
      setStatus((await res.json()) as OilStatus)
    } catch {
      onMessage({ type: 'error', text: '油画设置读取失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
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
      const data = (await res.json()) as OilResponse
      if (!res.ok) throw new Error(data.error || '保存失败')
      setStatus(data as OilStatus)
      setApiKey('')
      onMessage({ type: 'success', text: okText })
    } catch (e) {
      onMessage({ type: 'error', text: e instanceof Error ? e.message : '保存失败' })
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
          <Icon icon={AlertCircle} size="sm" className="mt-0.5 shrink-0" />
          <span>服务器未配置 APP_ENCRYPTION_KEY，无法保存油画设置（含 API key）。请先在服务器 .env 配置该密钥。</span>
        </div>
      )}

      {/* 开关 */}
      <div className="border border-warm-200 dark:border-warm-700 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-warm-900 dark:text-white">照片转油画</p>
            <p className="mt-1 text-sm text-warm-500 dark:text-warm-400">
              开启后，画册阅读器里的照片可按需生成油画版（通义 wanx2.1-imageedit，按张计费，生成结果缓存、每张只生成一次）。
              {status?.enabledSource === 'env' && '（当前开关来自服务器环境变量，保存后改为后台管理）'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!status?.enabled}
            disabled={saving || !status?.encryptionConfigured}
            onClick={() => void save({ enabled: !status?.enabled }, status?.enabled ? '已关闭油画生成' : '已开启油画生成')}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              status?.enabled ? 'bg-primary-500' : 'bg-warm-300 dark:bg-warm-600'
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
      <div className="border border-warm-200 dark:border-warm-700 rounded-xl p-4">
        <p className="font-medium text-warm-900 dark:text-white">通义 API Key（DashScope）</p>
        <p className="mt-1 text-sm text-warm-500 dark:text-warm-400">
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
            className="w-full px-3 py-2.5 pr-10 border border-warm-300 dark:border-warm-600 rounded-lg bg-white dark:bg-warm-800 text-warm-900 dark:text-warm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
            aria-label={showKey ? '隐藏 key' : '显示 key'}
          >
            <Icon icon={showKey ? EyeOff : Eye} size="sm" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={saving || !apiKey.trim() || !status?.encryptionConfigured}
            onClick={() => void save({ apiKey }, 'API key 已更新')}
            className="inline-flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Icon icon={Save} size="sm" />
            {saving ? '保存中...' : '保存 Key'}
          </button>
          {status?.hasKey && (
            <button
              type="button"
              disabled={saving || !status?.encryptionConfigured}
              onClick={() => void save({ clearKey: true }, 'API key 已清除')}
              className="px-4 py-2 bg-warm-100 hover:bg-warm-200 dark:bg-warm-700 dark:hover:bg-warm-600 text-warm-700 dark:text-warm-200 text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              清除 Key
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
