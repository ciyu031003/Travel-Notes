import { cn } from '@/lib/utils'

/**
 * 品牌标志：public/brand/logo.png（甜途 logo，2026-09-05 定稿，永久不变更）。
 * 全站唯一品牌位入口——新页面一律用本组件，不直接引用图片路径。
 */
export default function BrandLogo({
  size = 32,
  rounded = 'rounded-xl',
  className,
}: {
  size?: number
  rounded?: string
  className?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo.png"
      alt="行迹标志"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      draggable={false}
      className={cn('shrink-0 select-none object-cover', rounded, className)}
    />
  )
}
