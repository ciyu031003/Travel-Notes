'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { avatarVariantUrl } from '@/lib/modules/social/avatar-variants'

interface SocialAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: number
  className?: string
}

/** 旅行圈/个人主页统一头像：照片优先，无照片时使用暖金首字母。 */
export default function SocialAvatar({ name, avatarUrl, size = 40, className }: SocialAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null)
  // 大头像（资料页/个人主页，≥72）优先使用 1024 preview 变体；旧头像无变体时回退主图
  const previewSrc = avatarUrl && size >= 72 ? avatarVariantUrl(avatarUrl, 'preview') : null
  const src =
    failed === null
      ? previewSrc ?? avatarUrl ?? null
      : failed === previewSrc
        ? (avatarUrl ?? null)
        : null

  if (avatarUrl && src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        onError={() => setFailed(src)}
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-[var(--social-line)]', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-[var(--social-surface2)] font-semibold text-[var(--social-accent)] ring-1 ring-[var(--social-line)]', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
