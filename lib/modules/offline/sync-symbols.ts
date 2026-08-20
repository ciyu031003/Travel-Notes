/**
 * 同步状态符号（Stage 3.5）：图标 + 颜色双通道，沿用 Stage 1 像素符号语言。
 * 颜色取自 --album-*（ok/sync/wait/error）。
 */
import type { SyncStatus } from './types'

export interface SyncBadgeSpec {
  symbol: string
  label: string
  color: string
}

export const SYNC_BADGES: Record<SyncStatus, SyncBadgeSpec> = {
  SYNCED: { symbol: '✓', label: '已同步', color: '#6fcf97' },
  PENDING_UPLOAD: { symbol: '↑', label: '待上传', color: '#f5c97e' },
  PENDING_DOWNLOAD: { symbol: '☁', label: '仅云端', color: '#9aa3b2' },
  ERROR: { symbol: '!', label: '同步失败', color: '#e06c6c' },
}
