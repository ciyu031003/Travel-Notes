import { cn } from '@/lib/utils'

/**
 * 品牌标志：运行时使用 public/brand/logo-512.png（512×512，258KB）——
 * 原 2048×2048 的 logo.png 仅在 gen-splash/gen-icons 生成启动屏/图标时作为源图，不运行时引用，
 * 避免每次页面的导航/登录都拉 2MB 大图。logo 定稿 2026-09-05 永久不变更。
 * 全站唯一品牌位入口——新页面一律用本组件，不直接引用图片路径。
 * 改品牌：替换 public/brand/logo.png + logo-512.png 后重跑 node scripts/gen-icons.mjs
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
      src="/brand/logo-512.png"
      alt="行迹标志"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      draggable={false}
      className={cn('shrink-0 select-none object-cover', rounded, className)}
    />
  )
}
