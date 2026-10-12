/**
 * 同步状态符号（Stage 3.5 / P0 修订）：图标 + 颜色双通道。
 *
 * 修订说明（P0）：此前用字符 `✓ ↑ ☁ !` 冒充图标，并写死 4 个 hex —— 两者都违反
 * 《移动端设计规范》：
 *   · §1 第 7 条「禁止用字符冒充图标」—— 字形依赖字体覆盖，像素字体/回退字体下
 *     会出现缺字或字形突变，且无法随字号/描边规范统一；
 *   · §2「一切颜色走 token」—— 写死 hex 后主题切换不跟随。
 * 现改为：图标走 lucide 组件（交 <Icon> 渲染，尺寸/描边由体系锁定），
 * 颜色改走 --m-* 语义 token（与移动端体系一致；album 场景由父级 tone 覆盖）。
 */
import { AlertCircle, ArrowUp, Check, Cloud } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SyncStatus } from './types'

export interface SyncBadgeSpec {
  /** 图标组件（交 <Icon> 渲染，锁定 3 档尺寸 / 2 档描边） */
  icon: LucideIcon
  /** 无障碍与 title 文案 */
  label: string
  /** 前景色 CSS 变量名（不写死 hex，随主题走） */
  colorVar: string
}

export const SYNC_BADGES: Record<SyncStatus, SyncBadgeSpec> = {
  SYNCED: { icon: Check, label: '已同步', colorVar: 'var(--m-success)' },
  PENDING_UPLOAD: { icon: ArrowUp, label: '待上传', colorVar: 'var(--m-warning)' },
  PENDING_DOWNLOAD: { icon: Cloud, label: '仅云端', colorVar: 'var(--m-muted)' },
  ERROR: { icon: AlertCircle, label: '同步失败', colorVar: 'var(--m-danger)' },
}
