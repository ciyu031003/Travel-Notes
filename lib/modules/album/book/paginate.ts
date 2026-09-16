import type { BookPage, BookSpread, BookSpreadMode } from './types'

/**
 * 分页（对开编排）——纯函数，无 DOM、无 IO。
 *
 * 职责边界（Album 2.0 M1 的关键设计）：
 *  - `composer` 决定「有哪些逻辑页、每页放什么」；
 *  - `paginate` 决定「逻辑页如何变成物理页、哪些组成一个对开、页码是多少」；
 *  - 页面模板**不再**自己凑奇偶配平。
 *
 * 旧实现把配平写在渲染器里（`placed % 2 === 1 → push(blank)`），一旦引入
 * PHOTO_PAIR / COLLAGE 这类模板就会错位配平；且它**在双页模式下**才做配平，
 * 导致单/双页两套页面数量不同、页码语义漂移。这里统一收口。
 *
 * 规则：
 *  - `single`（移动单页）：**不展开**跨页出血逻辑页——整幅照片在单页里 contain 完整展示
 *    （展开成两个半页反而会把照片腰斩）。一逻辑页 = 一物理页 = 一个跨页。
 *  - `dual`（桌面对开）：`half === 'spread'` 的逻辑页展开为左半 + 右半两页
 *    （引用同一张照片，渲染器各显一半拼成出血跨页），其余为一物理页。
 *  - `dual` 下物理页两两成对；落单的那页成为跨页的**右页**（left = null），
 *    不复制不丢弃，符合实体书"右页起排"的观感。
 */

/** 展开逻辑页 → 物理页（仅用于双页对开：跨页出血逻辑页变成左半 + 右半） */
export function expandPages(pages: BookPage[]): BookPage[] {
  const out: BookPage[] = []
  for (const page of pages) {
    if (page.half === 'spread') {
      out.push({ ...page, id: `${page.id}-l`, side: 'left' })
      out.push({ ...page, id: `${page.id}-r`, side: 'right' })
    } else {
      out.push({ ...page, side: undefined })
    }
  }
  return out
}

/**
 * 把顺序逻辑页面编排为对开序列。返回的 `BookSpread[]` 即阅读器唯一消费结构，
 * 单页 / 双页两种模式产出**同一结构**、只是分组不同。
 *
 * @param pages 顺序逻辑页（由 composer 产出；第 0 页预期为 COVER）
 * @param mode  'single' | 'dual'
 */
export function paginate(pages: BookPage[], mode: BookSpreadMode): BookSpread[] {
  if (pages.length === 0) return []

  if (mode === 'single') {
    return pages.map((page, i) => ({
      id: `spread-${i}`,
      left: null,
      right: page,
      pageNumber: i + 1,
    }))
  }

  const physical = expandPages(pages)
  const spreads: BookSpread[] = []
  let pageNumber = 1
  for (let i = 0; i < physical.length; i += 2) {
    const left = physical[i]
    const right = physical[i + 1] ?? null
    if (right) {
      spreads.push({ id: `spread-${spreads.length}`, left, right, pageNumber })
    } else {
      // 落单页：作为右页单独成跨页（左页留空），而不是丢弃或复制
      spreads.push({ id: `spread-${spreads.length}`, left: null, right: left, pageNumber })
    }
    pageNumber += 1
  }
  return spreads
}

/** 包含指定逻辑页 id 的跨页下标（章节跳转 / 深链定位用） */
export function spreadIndexOfPage(spreads: BookSpread[], pageId: string): number {
  const idx = spreads.findIndex(
    (s) => s.left?.id === pageId || s.right?.id === pageId ||
      s.left?.id.startsWith(`${pageId}-`) || s.right?.id.startsWith(`${pageId}-`),
  )
  return idx < 0 ? 0 : idx
}

/** 双页对开下的物理页数（诊断/测试用；单页模式请直接用 pages.length） */
export function countPhysicalPages(pages: BookPage[]): number {
  return expandPages(pages).length
}
