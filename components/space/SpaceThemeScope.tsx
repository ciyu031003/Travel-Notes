import type { ReactNode } from 'react'
import { spaceThemeOf } from '@/lib/mobile/space-system'

/**
 * 空间主题作用域 —— **唯一**允许挂 `data-space` 的地方。
 *
 * 为什么要有这个组件而不是到处写 `data-space={type}`：
 * ① 色值必须能"收敛"到一棵子树里。空间主题只有 7 个令牌（见 globals.css），
 *    中性层/品牌赤陶/间距/圆角全部共享 —— 不套作用域就落到 `:root` 兜底，
 *    套错地方则会污染全局观感。收成一个组件后，审查只需看这一处。
 * ② `spaceThemeOf()` 会把未知类型回落到 `OTHER`，避免 `data-space="XXX"`
 *    匹配不到任何 CSS 块（组件不报错，但会拿到兜底色，徽标与主题色不一致）。
 * ③ 未来若要加"用户自定义配色"，只需在这里多插一层覆盖变量，组件不用动。
 *
 * 用法：
 *   <SpaceThemeScope type={space.spaceType}>…整页或整卡…</SpaceThemeScope>
 */
export function SpaceThemeScope({
  type,
  children,
  className,
}: {
  type?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <div data-space={spaceThemeOf(type)} className={className}>
      {children}
    </div>
  )
}

export default SpaceThemeScope
