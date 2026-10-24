'use client'

import { useState } from 'react'
import {
  User,
  Key,
  Mail,
  Heart,
  Palette,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Shield,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'
import { useSettingsAuth } from '@/hooks/use-settings-auth'
import type { SettingsMessage } from '@/components/settings/types'
import ProfileTab from '@/components/settings/ProfileTab'
import PasswordTab from '@/components/settings/PasswordTab'
import EmailTab from '@/components/settings/EmailTab'
import TravelTab from '@/components/settings/TravelTab'
import OilTab from '@/components/settings/OilTab'

type TabType = 'profile' | 'password' | 'email' | 'travel' | 'paint'

interface TabDef {
  id: TabType
  label: string
  icon: LucideIcon
}

/**
 * 账号设置（P2-32 拆分后的壳）。
 *
 * 拆分前本文件 1091 行，5 个 Tab 的 UI/状态/提交逻辑全在一起；现在：
 *  · 鉴权 → hooks/use-settings-auth.ts
 *  · 5 个 Tab → components/settings/{Profile,Password,Email,Travel,Oil}Tab.tsx（各自管状态）
 *  · 共享的 message 提示与 Tab 路由留在这里（目标 <150 行）
 * 行为/文案/请求路径/接口参数均未变化，纯重构。
 */
const TABS: TabDef[] = [
  { id: 'profile', label: '基本信息', icon: User },
  { id: 'password', label: '修改密码', icon: Key },
  { id: 'email', label: '邮箱绑定', icon: Mail },
  { id: 'travel', label: '旅行设置', icon: Heart },
  { id: 'paint', label: '油画生成', icon: Palette },
]

export default function AdminSettingsPage() {
  const { loading } = useSettingsAuth()
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [message, setMessage] = useState<SettingsMessage | null>(null)

  if (loading) {
    return (
      <div className="min-h-dvh bg-warm-50 dark:bg-warm-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <AdminShell title="账号设置">
      <main className="mx-auto max-w-4xl px-1 py-2">
        <div className="bg-white dark:bg-warm-800 rounded-xl shadow-xs overflow-hidden">
          <div className="border-b border-warm-200 dark:border-warm-700">
            <nav className="flex -mb-px" aria-label="Tabs">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-warm-500 hover:text-warm-700 dark:text-warm-400 dark:hover:text-warm-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 inline mr-2" />
                    {tab.label}
                  </button>
                )
              })}
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

            {activeTab === 'profile' && <ProfileTab onMessage={setMessage} />}
            {activeTab === 'password' && <PasswordTab onMessage={setMessage} />}
            {activeTab === 'email' && <EmailTab onMessage={setMessage} />}
            {activeTab === 'travel' && <TravelTab onMessage={setMessage} />}
            {activeTab === 'paint' && <OilTab onMessage={setMessage} />}
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
