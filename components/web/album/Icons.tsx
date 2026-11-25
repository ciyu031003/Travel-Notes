'use client'

/**
 * Web 相册内联 SVG 图标集
 * ---------------------------------------------------------------------------
 * 约束：lucide-react 只允许在 components/mobile/** 里直接 import，本目录不引 lucide，
 * 也不使用字符冒充图标（✦ → 等会被 token 门禁拦住），因此这里手写最小 SVG。
 * 所有图标继承 currentColor、尺寸由 props 控制（默认 18），无裸色值。
 */

export type GlyphProps = { size?: number; className?: string }

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
    focusable: 'false' as const,
  }
}

export function IconChevronLeft({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}

export function IconChevronRight({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </svg>
  )
}

export function IconArrowRight({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

export function IconClose({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconBook({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 6.5C10.4 5.3 8.4 4.7 5.8 4.7c-.7 0-1.3.6-1.3 1.3v11.3c0 .7.6 1.3 1.3 1.3 2.6 0 4.6.6 6.2 1.8 1.6-1.2 3.6-1.8 6.2-1.8.7 0 1.3-.6 1.3-1.3V6c0-.7-.6-1.3-1.3-1.3-2.6 0-4.6.6-6.2 1.8Z" />
      <path d="M12 6.5v13" />
    </svg>
  )
}

export function IconCamera({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4.5 8.5h2.2l1.2-1.8h6.2l1.2 1.8h2.2c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5v-7c0-.8.7-1.5 1.5-1.5Z" />
      <circle cx="12" cy="13.2" r="3" />
    </svg>
  )
}

export function IconLayers({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m12 4 8 4.2-8 4.2-8-4.2L12 4Z" />
      <path d="m4 12.2 8 4.2 8-4.2" />
      <path d="m4 16.2 8 4.2 8-4.2" />
    </svg>
  )
}

export function IconExpand({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15" />
    </svg>
  )
}

export function IconSparkle({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 3.5c.7 3.6 1.9 4.8 5.5 5.5-3.6.7-4.8 1.9-5.5 5.5-.7-3.6-1.9-4.8-5.5-5.5 3.6-.7 4.8-1.9 5.5-5.5Z" />
      <path d="M18.2 15c.35 1.8.95 2.4 2.8 2.75-1.85.35-2.45.95-2.8 2.75-.35-1.8-.95-2.4-2.8-2.75 1.85-.35 2.45-.95 2.8-2.75Z" />
    </svg>
  )
}

export function IconPin({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 21s6.5-5.4 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10.4" r="2.4" />
    </svg>
  )
}

export function IconCalendar({ size = 18, className }: GlyphProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.6" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </svg>
  )
}
