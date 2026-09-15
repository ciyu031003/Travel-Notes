/**
 * 相册三模式 · 唯一事实源
 * ============================================================================
 * 背景：同一个模式此前在不同入口叫法不一 —— 画册墙叫「网格」，银河/像素叫
 * 「像素风」，还有「切到像素风」；图标也不统一（银河在书模式用 Orbit、在像素
 * 模式用 Rocket）。命名与图标的漂移会让用户以为是不同的东西。
 *
 * 约定：
 *   · 名称固定为「画册 / 像素 / 银河」，顺序固定
 *   · 图标固定为 BookOpen / LayoutGrid / Orbit
 *   · 各模式保留自己的**皮肤**（圆角胶囊 / 像素直角 / 玻璃），只统一语义
 *
 * 新增入口一律从这里取，不要再手写文案与图标。
 */
import { BookOpen, LayoutGrid, Orbit, type LucideIcon } from 'lucide-react'

export const ALBUM_MODE_KEYS = ['book', 'pixel', 'space'] as const
export type AlbumModeKey = (typeof ALBUM_MODE_KEYS)[number]

export interface AlbumModeMeta {
  key: AlbumModeKey
  label: string
  title: string
  icon: LucideIcon
}

export const ALBUM_MODES: readonly AlbumModeMeta[] = [
  { key: 'book', label: '画册', title: '切换到旅行画册', icon: BookOpen },
  { key: 'pixel', label: '像素', title: '切换到像素风', icon: LayoutGrid },
  { key: 'space', label: '银河', title: '切换到银河空间', icon: Orbit },
] as const

export function albumModeOf(key: AlbumModeKey): AlbumModeMeta {
  return ALBUM_MODES.find((m) => m.key === key) ?? ALBUM_MODES[0]
}
