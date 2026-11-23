import { cn } from '@/lib/utils'

/**
 * 品牌标志：运行时只用「按显示尺寸生成的小图」——
 * ---------------------------------------------------------------------------
 * E2（2026-11-23）之前直接引用 public/brand/logo-512.png（512×512，75KB），
 * 但品牌位实际只显示 32px / 36px；根布局里这张图还会被 React 预加载
 * （<link rel="preload" as="image">），于是在 0.8Mbps 弱网下每页首屏先花
 * ~0.6s 拉一张最终缩到 32px 的图，排在 CSS/JS 之前。
 *
 * 现在改为 <picture> + srcSet：
 *   · webp 优先（1x 96px = 1.3KB / 2x 160px = 2.3KB），
 *   · 不支持 webp 的壳自动回退 png（1x 3.3KB / 2x 7.3KB），
 *   · 变体由 node scripts/gen-brand-variants.mjs 从 512 源图生成。
 * 原 logo-512.png 仍保留给 PWA manifest / 启动图标，不在页面里引用。
 *
 * 全站唯一品牌位入口——新页面一律用本组件，不直接引用图片路径。
 * 改品牌：替换 public/brand/logo.png + logo-512.png 后重跑
 *   node scripts/gen-brand-variants.mjs && node scripts/gen-icons.mjs
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
    <picture>
      <source
        type="image/webp"
        srcSet={'/brand/logo-96.webp 1x, /brand/logo-160.webp 2x'}
      />
      <img
        src="/brand/logo-96.png"
        srcSet="/brand/logo-96.png 1x, /brand/logo-160.png 2x"
        alt="甜途标志"
        width={size}
        height={size}
        loading="eager"
        decoding="async"
        style={{ width: size, height: size }}
        draggable={false}
        className={cn('shrink-0 select-none object-cover', rounded, className)}
      />
    </picture>
  )
}
