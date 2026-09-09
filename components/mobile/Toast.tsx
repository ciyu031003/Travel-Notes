'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dismissToast, subscribeToasts, type ToastItem } from '@/lib/mobile/toast-store'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

/** 轻提示宿主：全局挂载一次（root layout），订阅 toast store 渲染顶部提示 */
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
        const Icon = ICONS[item.kind]
        return (
          <div key={item.id} className={cn('m-toast m-enter')} data-kind={item.kind}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 text-[13px] leading-snug">{item.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label="关闭提示"
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
