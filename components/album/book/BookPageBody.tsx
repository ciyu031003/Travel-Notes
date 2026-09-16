'use client'

import type { BookPage } from '@/lib/modules/album/book/types'
import { getBookTheme } from './themes/registry'
import { DefaultPageBody } from './sheets/base'

/**
 * 画册页分发器（Album 2.0 M3）
 *
 * 单点决定「这一页由哪个主题组件渲染」：
 *   1. COVER → 主题的 cover（封面材质与内页完全不同，单独给）
 *   2. 其余页型 → 主题的 bodies[type]（未覆盖则回落默认画报版式）
 *
 * 【硬约束】本组件**只影响视觉**：不增删页、不改 `side`、不改 `page` 内容。
 * 对开分组与页码由 `paginate` 唯一决定（见 tests/unit/book-theme.test.ts 的断言）。
 */
export function BookPageBody({
  page,
  themeKey,
}: {
  page: BookPage | null
  themeKey: string
}) {
  if (!page) return <DefaultPageBody page={null} />
  const theme = getBookTheme(themeKey)
  if (page.type === 'COVER') {
    const Cover = theme.cover
    return <Cover page={page} />
  }
  const Override = theme.bodies[page.type]
  if (Override) return <Override page={page} />
  return <DefaultPageBody page={page} />
}

export { DefaultPageBody }
