'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { dismissToast, subscribeToasts, type ToastItem } from '@/lib/mobile/toast-store'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

/**
 * 轻提示宿主：全局挂载一次（root layout），订阅 toast store 渲染顶部提示。
 *
 * M5 升级：
 *  · 关闭按钮从 16px 图标（无内边距）提到 40px 圆形命中区
 *  · 可选倒计时进度条（progress）与操作按钮（action，如「撤销」）
 *  · 文案从硬编码 text-[13px] 收敛到 m-caption 字阶
 */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[120] flex flex-col items-center gap-2 px-4"
    >
      {items.map((item) => {
        const ToastIcon = ICONS[item.kind]
        const dismissible = item.dismissible !== false
        return (
          <div key={item.id} className="m-toast m-enter pointer-events-auto" data-kind={item.kind}>
            <span className="m-toast-icon">
              <Icon icon={ToastIcon} size="sm" />
            </span>
            <span className="m-caption min-w-0 flex-1">{item.message}</span>

            {item.action && (
              <button
                type="button"
                className="m-toast-action m-pressable"
                onClick={() => {
                  void hapticLight()
                  item.action?.onClick()
                  dismissToast(item.id)
                }}
              >
                {item.action.label}
              </button>
            )}

            {dismissible && (
              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                aria-label="关闭提示"
                className="m-toast-close m-pressable"
              >
                <Icon icon={X} size="sm" />
              </button>
            )}

            {item.progress && (
              <span className="m-toast-track" aria-hidden="true">
                <span
                  className="m-toast-bar"
                  style={{ animationDuration: `${item.duration}ms` }}
                />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
