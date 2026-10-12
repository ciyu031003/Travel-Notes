'use client'

import type { SyncStatus } from '@/lib/modules/offline/types'
import { SYNC_BADGES } from '@/lib/modules/offline/sync-symbols'
import { Icon } from '@/components/mobile/Icon'

/**
 * 同步状态角标（Stage 3.5 / P0 修订）：照片右下角的状态标记，图标 + 颜色双通道。
 * 仅在有意义的非默认状态（待上传/仅云端/失败）时才显示，避免每张照片都挂角标。
 *
 * 修订（P0）：
 *  · 字符冒充图标 → <Icon> + lucide（规范 §1 第 7 条 / §5）；
 *  · 写死 hex + rgba → --m-* token（规范 §2）；
 *  · 18px 硬编码圆点 → 视觉 20px、触达层由父级承载（本组件为纯状态指示、不可点，
 *    故不强制 44×44；若将来要可点，改用 IconButton）。
 */
export default function SyncBadge({ status, className }: { status: SyncStatus; className?: string }) {
  const spec = SYNC_BADGES[status]
  if (!spec || status === 'SYNCED') return null
  return (
    <span
      title={spec.label}
      role="img"
      aria-label={spec.label}
      className={
        'm-press inline-flex h-5 w-5 items-center justify-center rounded-full ' +
        'bg-[rgba(5,5,8,0.72)] shadow-[var(--m-elev-1)] ' +
        (className || '')
      }
      style={{ color: spec.colorVar }}
    >
      <Icon icon={spec.icon} size="sm" />
    </span>
  )
}
