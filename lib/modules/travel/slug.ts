/**
 * 旅行 slug 生成（唯一事实源）。
 *
 * 为什么必须共享：原生壳离线新建旅行时也要写 `slug`。
 * 早先本地写的是**空串**、而读取时回退成 `travel-<localId>`，
 * 两侧不一致 → `/travel/<slug>` 永远打不开，用户"建完看不到也进不去"。
 * 现在服务端与本地写共用这一个函数，保证同一个标题在任何一侧都得到同一个 slug。
 */
export function travelSlugBase(title: string): string {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * 生成最终 slug：标题可生成时用标题；否则（全部是符号/空标题）回退到带时间戳的占位。
 * @param fallbackSuffix 用于占位 slug 的唯一后缀（服务端可传空、本地可传 localId）
 */
export function makeTravelSlug(title: string, fallbackSuffix?: string | number): string {
  const base = travelSlugBase(title)
  if (base) return base
  const suffix = fallbackSuffix != null && String(fallbackSuffix) ? `-${fallbackSuffix}` : ''
  return `travel${suffix}-${Date.now()}`
}
