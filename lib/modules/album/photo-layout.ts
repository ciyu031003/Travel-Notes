import type { BookPhoto } from '@/components/album/travel-book/TravelBook'

/**
 * 相册画册照片「横竖屏自适应预览」纯逻辑（组件与单测共用）：
 * - 竖屏照片 → 单页完整展示；
 * - 横屏照片只有宽高比 ≥ 双页画幅才跨两页出血，保证头脚完整；
 * - 4:3 / 3:2 准横屏照片跨页必然上下裁切，回退单页 contain。
 */

/** 双页展开画幅比：单页画幅 0.8（512×640），两页并排合计 1.6 */
export const SPREAD_ASPECT = 1.6

/** 照片页排版变体：单页整幅 / 跨页左半页 / 跨页右半页 */
export type PhotoVariant = 'single' | 'spread-left' | 'spread-right'

/**
 * 判定照片横竖屏：宽 > 高 ×1.05 视为横屏，其余（含未知宽高）视为竖屏。
 */
export function photoOrientation(
  photo: Pick<BookPhoto, 'width' | 'height'>,
  measured?: { w: number; h: number } | null,
): 'landscape' | 'portrait' {
  const w = measured?.w ?? photo.width
  const h = measured?.h ?? photo.height
  if (w && h && w > h * 1.05) return 'landscape'
  return 'portrait'
}

/**
 * 判定照片是否适合跨两页出血：宽高比 ≥ 1.6 时跨页「全高可见、仅左右出血」，
 * 头脚不裁；更小的准横屏照片跨页必裁头脚，应回退单页 contain 完整展示。
 */
export function photoSpreadFits(
  photo: Pick<BookPhoto, 'width' | 'height'>,
  measured?: { w: number; h: number } | null,
): boolean {
  const w = measured?.w ?? photo.width
  const h = measured?.h ?? photo.height
  if (!w || !h) return false
  return w / h >= SPREAD_ASPECT - 1e-6
}
