import Link from 'next/link'
import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { cn } from '@/lib/utils'

/**
 * 液态玻璃（Liquid Glass）标签。
 *
 * 用在**照片封面**上，所以在任何主题下都保持「浅玻璃 + 深字 + 白描边」的固定配色：
 * 封面图本身颜色不可控，跟随主题 token 会在浅色主题下变成深棕字压深色照片。
 * 具体质感（模糊 / 内高光 / 折射扫光）见 app/mobile.css 的 .m-liquid-glass。
 */
export function LiquidGlass({
  children,
  className,
  icon,
}: {
  children: ReactNode
  className?: string
  /** 可选前置图标（默认不显示） */
  icon?: ReactNode
}) {
  return (
    <span className={cn('m-liquid-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5', className)}>
      <span className="relative z-[2] inline-flex items-center gap-1.5 text-[#3A2028]">
        {icon}
        {children}
      </span>
    </span>
  )
}

/**
 * 地点玻璃标签：旅行圈 / 旅程封面统一用这一枚。
 * 位置文字过长时省略，不换行破坏封面构图。
 */
export function LiquidGlassLocation({
  location,
  className,
  size = 'md',
}: {
  location: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <LiquidGlass
      icon={<Icon icon={MapPin} size={size === 'sm' ? 'sm' : 'md'} />}
      className={cn(
        'max-w-[68vw]',
        size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
        className,
      )}
    >
      <span className={cn('truncate font-semibold tracking-tight', size === 'sm' ? 'text-[11px]' : 'text-[12.5px]')}>
        {location}
      </span>
    </LiquidGlass>
  )
}

/** 带链接的玻璃标签（详情页作者信息等场景可复用） */
export function LiquidGlassLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex', className)}>
      <LiquidGlass>{children}</LiquidGlass>
    </Link>
  )
}

export default LiquidGlassLocation
