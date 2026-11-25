import type { SVGProps } from 'react'

/**
 * Web 票据页的内联图标
 * ---------------------------------------------------------------------------
 * 项目规矩：lucide 只允许在 components/mobile/** 里 import（设计 token 门禁第 2 条）。
 * 这里是 components/web/**，所以直接用内联 SVG —— 也就顺带省掉了一整包图标的
 * JS 依赖，且描边/尺寸完全跟着字体与 CSS 走。
 *
 * 全部为装饰性（aria-hidden）：可读文案始终由按钮/链接的文字或 aria-label 提供。
 */
type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="wt-svg"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 12h15" />
      <path d="M13.5 6.5 20 12l-6.5 5.5" />
    </Base>
  )
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </Base>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Base>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Base>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Base>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Base>
  )
}

export function TicketIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h13a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6Z" />
      <path d="M14.5 7.5v9" strokeDasharray="2 3" />
    </Base>
  )
}
