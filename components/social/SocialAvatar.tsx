'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface SocialAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: number
  className?: string
}

/** 旅行圈/个人主页统一头像：照片优先，无照片时使用暖金首字母。 */
export default function SocialAvatar({ name, avatarUrl, size = 40, className }: SocialAvatarProps) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-night-line', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-night-surface2 font-semibold text-night-gold ring-1 ring-night-line', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
