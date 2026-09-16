import { describe, it, expect } from 'vitest'
import { expandPages, paginate, spreadIndexOfPage, countPhysicalPages } from '@/lib/modules/album/book/paginate'
import type { BookPage } from '@/lib/modules/album/book/types'

/**
 * paginate 单测（Album 2.0 M1）
 * 守住的核心契约：单页/双页两种模式产出**同一结构**，且跨页出血页永不错位。
 */

let idSeq = 0
function page(type: BookPage['type'], over: Partial<BookPage> = {}): BookPage {
  idSeq += 1
  return { id: `p${idSeq}`, type, dayIndex: null, photos: [], ...over }
}

describe('expandPages', () => {
  it('普通逻辑页 = 一个物理页，不带 side', () => {
    const out = expandPages([page('COVER'), page('PHOTO_CAPTION')])
    expect(out).toHaveLength(2)
    expect(out[1].side).toBeUndefined()
  })

  it('half=spread 的逻辑页展开为左半 + 右半两页，引用同一张照片', () => {
    const spread = page('FULL_BLEED', { half: 'spread', photos: [] })
    const out = expandPages([spread])
    expect(out).toHaveLength(2)
    expect(out.map((p) => p.side)).toEqual(['left', 'right'])
    expect(out[0].id).toBe(`${spread.id}-l`)
    expect(out[1].id).toBe(`${spread.id}-r`)
  })

  it('countPhysicalPages 与展开结果一致', () => {
    const pages = [page('COVER'), page('FULL_BLEED', { half: 'spread' }), page('ENDING')]
    expect(countPhysicalPages(pages)).toBe(expandPages(pages).length)
    expect(countPhysicalPages(pages)).toBe(4)
  })
})

describe('paginate · single 模式', () => {
  it('一物理页 = 一个跨页，left 恒为 null，页码从 1 连续', () => {
    const pages = [page('COVER'), page('OPENING'), page('PHOTO_CAPTION')]
    const spreads = paginate(pages, 'single')
    expect(spreads).toHaveLength(3)
    expect(spreads.every((s) => s.left === null)).toBe(true)
    expect(spreads.map((s) => s.pageNumber)).toEqual([1, 2, 3])
  })

  it('跨页出血逻辑页在单页模式下不展开（整页 contain 展示）', () => {
    const spreads = paginate([page('FULL_BLEED', { half: 'spread' })], 'single')
    expect(spreads).toHaveLength(1)
    expect(spreads[0].right.half).toBe('spread')
    expect(spreads[0].right.side).toBeUndefined()
  })

  it('空输入返回空数组', () => {
    expect(paginate([], 'single')).toEqual([])
  })
})

describe('paginate · dual 模式', () => {
  it('物理页两两成对，页码连续', () => {
    const pages = [page('COVER'), page('OPENING'), page('PHOTO_CAPTION'), page('ENDING')]
    const spreads = paginate(pages, 'dual')
    expect(spreads).toHaveLength(2)
    expect(spreads.map((s) => s.pageNumber)).toEqual([1, 2])
    expect(spreads[0].left?.type).toBe('COVER')
    expect(spreads[0].right?.type).toBe('OPENING')
  })

  it('落单的最后一页成为跨页的右页（left=null），不复制也不丢弃', () => {
    const pages = [page('COVER'), page('OPENING'), page('ENDING')]
    const spreads = paginate(pages, 'dual')
    expect(spreads).toHaveLength(2)
    expect(spreads[1].left).toBeNull()
    expect(spreads[1].right.type).toBe('ENDING')
  })

  it('跨页出血逻辑页在双页模式下左半 + 右半落在同一跨页', () => {
    const bleed = page('FULL_BLEED', { half: 'spread' })
    const spreads = paginate([page('OPENING'), bleed, page('ENDING')], 'dual')
    expect(spreads).toHaveLength(2)
    // 跨页 1：OPENING（左） + 出血左半（右）
    expect(spreads[0].left?.type).toBe('OPENING')
    expect(spreads[0].right?.side).toBe('left')
    // 跨页 2：出血右半（左） + ENDING（右）——两半劈开在同一本书内相邻
    expect(spreads[1].left?.side).toBe('right')
    expect(spreads[1].right?.type).toBe('ENDING')
  })

  it('单页与双页消费同一份逻辑页：物理页总数由 expandPages 唯一决定', () => {
    const pages = [
      page('COVER'),
      page('OPENING'),
      page('FULL_BLEED', { half: 'spread' }),
      page('PHOTO_CAPTION'),
      page('ENDING'),
    ]
    // 单页模式：跨页出血不展开 → 页数 = 逻辑页数
    expect(paginate(pages, 'single')).toHaveLength(pages.length)
    // 双页模式：跨页出血展开为 2 物理页 → 6 物理页 → 3 个对开
    expect(countPhysicalPages(pages)).toBe(pages.length + 1)
    expect(paginate(pages, 'dual')).toHaveLength(3)
  })
})

describe('spreadIndexOfPage', () => {
  it('按逻辑页 id 找到所属跨页', () => {
    const pages = [page('COVER'), page('OPENING'), page('ENDING')]
    const spreads = paginate(pages, 'dual')
    expect(spreadIndexOfPage(spreads, pages[2].id)).toBe(1)
  })

  it('跨页出血页按 -l/-r 后缀也能定位到同一跨页', () => {
    const bleed = page('FULL_BLEED', { half: 'spread' })
    const spreads = paginate([bleed, page('ENDING')], 'dual')
    expect(spreadIndexOfPage(spreads, bleed.id)).toBe(0)
    expect(spreadIndexOfPage(spreads, `${bleed.id}-r`)).toBe(0)
  })

  it('未知 id 回落到第 0 个跨页', () => {
    expect(spreadIndexOfPage(paginate([page('COVER')], 'single'), 'nope')).toBe(0)
  })
})
