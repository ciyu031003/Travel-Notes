'use client'

import { Icon } from '@/components/mobile/Icon'
import { CheckCircle2, Mail, XCircle } from '@/lib/mobile/icon-system'

/**
 * 已绑定/未绑定邮箱的状态卡（P2-32）。
 * 从 EmailTab 中抽出仅为控制单文件行数，视觉与拆分前逐字一致。
 */
export default function EmailStatusCard({
  email,
  verified,
  onUnbind,
}: {
  email: string | null
  verified: boolean
  onUnbind: () => void
}) {
  if (!email) {
    return (
      <div className="bg-warm-50 dark:bg-warm-700 rounded-xl p-4">
        <p className="text-sm text-warm-500 dark:text-warm-400">
          尚未绑定邮箱。绑定邮箱后，忘记密码时可通过邮箱验证找回。
        </p>
      </div>
    )
  }

  return (
    <div className="bg-warm-50 dark:bg-warm-700 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
            <Icon icon={Mail} size="md" className="text-primary-500" />
          </div>
          <div>
            <p className="font-medium text-warm-900 dark:text-white">{email}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {verified ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  {/* 保持拆分前 12px 尺寸（Icon 最小档 sm=16px 会让徽标变大） */}
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
          type="button"
          onClick={onUnbind}
          className="text-sm text-red-500 hover:text-red-600 transition-colors"
        >
          解除绑定
        </button>
      </div>
    </div>
  )
}
