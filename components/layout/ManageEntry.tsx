'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useCapabilities } from '@/hooks/use-capabilities'
import type { CapabilityKey } from '@/lib/modules/space/permissions'

interface ManageEntryProps {
  /** 目标管理页 */
  href: string
  /** 入口文案 */
  label?: string
  /** 前置图标（可选） */
  icon?: ReactNode
  /** 额外样式（各页面风格不同） */
  className?: string
  /** 无障碍 / 悬停提示 */
  title?: string
  /** 所需能力，默认 canManageContent（OWNER / MEMBER） */
  capability?: CapabilityKey
}

/**
 * 模块内「管理」入口（3.6 后台能力模块化）：
 * 依据服务端下发的 capabilities 显隐——前端只做显隐，写操作由服务端复检。
 * 未登录 / 无能力时渲染 null。
 */
export default function ManageEntry({
  href,
  label,
  icon,
  className,
  title,
  capability = 'canManageContent',
}: ManageEntryProps) {
  const caps = useCapabilities()
  if (!caps || !caps[capability]) return null
  return (
    <Link
      href={href}
      title={title ?? label}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      {icon}
      {label ? <span>{label}</span> : null}
    </Link>
  )
}
