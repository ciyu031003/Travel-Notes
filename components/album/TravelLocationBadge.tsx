'use client'

import { MapPin } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import PixelBadge from './PixelBadge'

interface TravelLocationBadgeProps {
  location: string
  className?: string
}

/**
 * 旅行地点标签：像素小标签 + 地点图标。
 * 用于相册档案 / 旅行圈卡片的地点信息。
 */
export default function TravelLocationBadge({ location, className }: TravelLocationBadgeProps) {
  if (!location) return null
  return (
    <PixelBadge className={className}>
      <Icon icon={MapPin} size="sm" />
      {location}
    </PixelBadge>
  )
}
