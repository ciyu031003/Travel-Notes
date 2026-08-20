'use client'

import type { SyncStatus } from '@/lib/modules/offline/types'
import { SYNC_BADGES } from '@/lib/modules/offline/sync-symbols'

/**
 * 同步状态角标（Stage 3.5）：照片右下角的像素符号，图标 + 颜色双通道。
 * 仅在有意义的非默认状态（待上传/仅云端/失败）时才显示，避免每张照片都挂角标。
 */
export default function SyncBadge({ status, className }: { status: SyncStatus; className?: string }) {
  const spec = SYNC_BADGES[status]
  if (!spec || status === 'SYNCED') return null
  return (
    <span
      title={spec.label}
      aria-label={spec.label}
      className={
        'inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold leading-none shadow-sm ' +
        (className || '')
      }
      style={{ color: spec.color, backgroundColor: 'rgba(5,5,8,0.72)' }}
    >
      {spec.symbol}
    </span>
  )
}
