import { describe, it, expect } from 'vitest'
import { coverObjectPosition, coverVariantUrl, coverFilePaths, COVER_SIZES } from '@/lib/modules/social/profile-cover'

/**
 * 头图焦点换算单测。
 *
 * 算法来自 LycheeOrg/Lychee（MIT，master 分支）
 * `resources/js/v7/components/gallery/albumModule/AlbumHeaderImage.vue`：
 *   x = (focusX * -1 + 1) * 50 ; y = (focusY * -1 + 1) * 50  →  `${x}% ${y}%`
 *
 * 这里锁住「用户点了哪一格 → 裁切看哪里」的对应关系，以及脏数据的兜底，
 * 因为一旦方向反了，用户点头图右下角却看到左上角，问题很隐蔽（图还是会动）。
 */

describe('coverObjectPosition', () => {
  it('无焦点（null/undefined）回落居中', () => {
    expect(coverObjectPosition(null, null)).toBe('center')
    expect(coverObjectPosition(undefined, undefined)).toBe('center')
  })

  it('只给一半坐标也算非法 → 居中（不允许半套焦点）', () => {
    expect(coverObjectPosition(0.5, null)).toBe('center')
    expect(coverObjectPosition(null, 0.5)).toBe('center')
  })

  it('九宫格中心 (0.5, 0.5) = 25%（Lychee 原生公式）', () => {
    // 公式 (focus * -1 + 1) * 50 在 focus=0.5 时给 25%，不是 50%。
    // 直觉上会以为「中心→50%」，但 object-position 的百分比是**图片上的取点位置**，
    // 与焦点在格子里的小数不是同一个坐标系。这里按原实现锁定数值，避免"顺手改成 (1-focus)*100"。
    expect(coverObjectPosition(0.5, 0.5)).toBe('25% 25%')
  })

  it('焦点越靠右下 → object-position 百分比越小（看清右下角）', () => {
    const bottomRight = coverObjectPosition(0.8333, 0.8333)
    const topLeft = coverObjectPosition(0.1667, 0.1667)
    expect(bottomRight).toBe('8.33% 8.33%')
    expect(topLeft).toBe('41.67% 41.67%')
    // 方向断言：右下格的百分比必须小于左上格
    expect(parseFloat(bottomRight)).toBeLessThan(parseFloat(topLeft))
    // 且「看右下」的百分比落在小值区（<50%），「看左上」落在偏大区（>25%）
    expect(parseFloat(bottomRight)).toBeLessThan(25)
    expect(parseFloat(topLeft)).toBeGreaterThan(25)
  })

  it('九个格子的取值与九宫格位置一一对应（不越界、不重复）', () => {
    const cell = (col: number, row: number) => coverObjectPosition((col + 0.5) / 3, (row + 0.5) / 3)
    expect(cell(0, 0)).toBe('41.67% 41.67%') // 左上 → 看左上
    expect(cell(1, 1)).toBe('25% 25%') // 中中
    expect(cell(2, 2)).toBe('8.33% 8.33%') // 右下 → 看右下
    expect(cell(0, 2)).toBe('41.67% 8.33%') // 左下
    expect(cell(2, 0)).toBe('8.33% 41.67%') // 右上
    // 九格两两不同（否则说明映射把不同格子折叠了）
    const all = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => cell(c, r)))
    expect(new Set(all).size).toBe(9)
  })

  it('有限但越界 → 夹到 0/1 边界（不当非法值丢掉）', () => {
    // clamp 到 0/1 后再套公式：(0*-1+1)*50 = 50%，(1*-1+1)*50 = 0%
    expect(coverObjectPosition(-3, 5)).toBe('50% 0%')
    expect(coverObjectPosition(2, -1)).toBe('0% 50%')
    // 不产生负数或超过 100% 的百分比
    for (const v of [-99, -0.0001, 1.0001, 99]) {
      const out = coverObjectPosition(v, v)
      const nums = out.match(/[\d.]+/g)!.map(Number)
      for (const n of nums) expect(n).toBeGreaterThanOrEqual(0)
      for (const n of nums) expect(n).toBeLessThanOrEqual(100)
    }
  })

  it('非法数字（NaN / Infinity / 字符串）回落居中', () => {
    expect(coverObjectPosition(NaN, 0.5)).toBe('center')
    expect(coverObjectPosition(Infinity, 0.5)).toBe('center')
    expect(coverObjectPosition('0.5' as unknown as number, 0.5)).toBe('center')
  })

  it('输出保留两位小数（避免长浮点把 style 撑长）', () => {
    expect(coverObjectPosition(1 / 3, 2 / 3)).toMatch(/^\d+(\.\d{1,2})?% \d+(\.\d{1,2})?%$/)
  })
})

describe('coverVariantUrl', () => {
  it('为 covers 目录的主图拼出变体地址', () => {
    expect(coverVariantUrl('/uploads/covers/cover-7-1.webp', 'preview')).toBe('/uploads/covers/cover-7-1-preview.webp')
    expect(coverVariantUrl('/uploads/covers/cover-7-1.webp', 'blur')).toBe('/uploads/covers/cover-7-1-blur.jpg')
  })

  it('绝对 URL 保留 origin', () => {
    expect(coverVariantUrl('https://cdn.example.com/uploads/covers/a.webp', 'preview')).toBe(
      'https://cdn.example.com/uploads/covers/a-preview.webp',
    )
  })

  it('已是变体或非 covers 目录 → null（消费端据此回退主图）', () => {
    expect(coverVariantUrl('/uploads/covers/a-preview.webp', 'preview')).toBeNull()
    expect(coverVariantUrl('/uploads/avatars/a.webp', 'preview')).toBeNull()
    expect(coverVariantUrl(null, 'preview')).toBeNull()
  })
})

describe('coverFilePaths', () => {
  it('返回主图 + 两个变体，主图在前（删除旧头图时用）', () => {
    expect(coverFilePaths('/uploads/covers/cover-7-1.webp')).toEqual([
      '/uploads/covers/cover-7-1.webp',
      '/uploads/covers/cover-7-1-preview.webp',
      '/uploads/covers/cover-7-1-blur.jpg',
    ])
  })

  it('非 covers 目录返回空数组（不误删别的文件）', () => {
    expect(coverFilePaths('/uploads/avatars/a.webp')).toEqual([])
    expect(coverFilePaths('https://cos.example.com/x.webp')).toEqual([])
  })
})

describe('COVER_SIZES', () => {
  it('三个变体的宽高比一致（都是 16:9），避免裁切比例不一致导致焦点错位', () => {
    const ratio = (s: { width: number; height: number }) => s.width / s.height
    expect(ratio(COVER_SIZES.main)).toBeCloseTo(16 / 9)
    expect(ratio(COVER_SIZES.preview)).toBeCloseTo(16 / 9)
    expect(ratio(COVER_SIZES.blur)).toBeCloseTo(16 / 9)
    expect(COVER_SIZES.main.width).toBeGreaterThan(COVER_SIZES.preview.width)
  })
})
