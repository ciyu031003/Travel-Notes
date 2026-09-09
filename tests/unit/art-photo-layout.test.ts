import { describe, it, expect } from 'vitest'
import {
  SPREAD_ASPECT,
  photoOrientation,
  photoSpreadFits,
  type PhotoVariant,
} from '@/lib/modules/album/photo-layout'

/**
 * 相册画册「横竖屏自适应预览」布局判定单测：
 * - 竖屏照片 → 单页完整展示（不得跨页出血）；
 * - 横屏照片只有宽高比 ≥ 双页画幅（1.6）才跨两页出血，头脚完整；
 * - 4:3 / 3:2 等准横屏照片跨页必然上下裁切，必须回退单页 contain；
 * - 服务端缺宽高时等图片加载测量后补判，未知宽高保守走单页。
 */
function photo(width: number | null, height: number | null) {
  return { id: 1, width, height }
}

describe('photoOrientation（语义横竖屏判定）', () => {
  it('宽 > 高 ×1.05 判横屏', () => {
    expect(photoOrientation(photo(4032, 3024) as never)).toBe('landscape')
    expect(photoOrientation(photo(4800, 3200) as never)).toBe('landscape')
    expect(photoOrientation(photo(1920, 1080) as never)).toBe('landscape')
  })

  it('宽 ≤ 高 ×1.05（含竖屏/接近正方形）判竖屏', () => {
    expect(photoOrientation(photo(3024, 4032) as never)).toBe('portrait')
    expect(photoOrientation(photo(1080, 1080) as never)).toBe('portrait')
    expect(photoOrientation(photo(1000, 980) as never)).toBe('portrait')
  })

  it('未知宽高保守判竖屏（单页展示）', () => {
    expect(photoOrientation(photo(null, null) as never)).toBe('portrait')
  })
})

describe('photoSpreadFits（可否跨页不裁头脚）', () => {
  it(`宽高比 ≥ ${SPREAD_ASPECT} 才适合跨页`, () => {
    expect(photoSpreadFits(photo(1920, 1080) as never)).toBe(true)
    expect(photoSpreadFits(photo(1600, 1000) as never)).toBe(true)
    expect(photoSpreadFits(photo(3840, 2400) as never)).toBe(true)
  })

  it('4:3 / 3:2 准横屏跨页必裁头脚 → 不跨页', () => {
    expect(photoSpreadFits(photo(4032, 3024) as never)).toBe(false)
    expect(photoSpreadFits(photo(4800, 3200) as never)).toBe(false)
  })

  it('竖屏与未知宽高不跨页', () => {
    expect(photoSpreadFits(photo(3024, 4032) as never)).toBe(false)
    expect(photoSpreadFits(photo(null, null) as never)).toBe(false)
  })

  it('加载后测量的自然宽高优先于服务端元数据', () => {
    // 服务端误写横屏（宽>高），但实测竖屏 → 不跨页
    expect(
      photoSpreadFits(photo(4032, 3024) as never, { w: 3024, h: 4032 }),
    ).toBe(false)
    // 服务端无宽高，实测 16:9 → 可以跨页
    expect(
      photoSpreadFits(photo(null, null) as never, { w: 1920, h: 1080 }),
    ).toBe(true)
  })
})

describe('PhotoVariant 类型基线（编译期守卫）', () => {
  it('变体取值只有 single / spread-left / spread-right', () => {
    const variants: PhotoVariant[] = ['single', 'spread-left', 'spread-right']
    expect(variants).toHaveLength(3)
  })
})
