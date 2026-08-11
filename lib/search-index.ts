// 客户端静态全文搜索（替代服务端 LIKE 搜索，2C2G 友好）
// 索引由 scripts/build-search-index.cjs 在部署后生成到 public/search-index.json
// 前端加载后本地即时检索；索引不可用时可回退到 /api/search

export interface IndexedPost {
  id: number
  slug: string
  module: 'blog' | 'mindmap'
  title: string
  date: string
  description: string
  tags: string[]
  location?: string
  content?: string
}

export interface SearchIndex {
  generatedAt: string
  version: number
  posts: IndexedPost[]
}

export interface StaticSearchResult {
  id: number
  slug: string
  title: string
  date: string
  description?: string
  tags?: string[]
  module: 'blog' | 'mindmap'
  score: number
}

let cachedIndex: SearchIndex | null = null
let loadingPromise: Promise<SearchIndex | null> | null = null

export async function loadSearchIndex(): Promise<SearchIndex | null> {
  if (cachedIndex) return cachedIndex
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      const res = await fetch('/search-index.json', { cache: 'no-cache' })
      if (!res.ok) return null
      const json = (await res.json()) as SearchIndex
      if (!json || !Array.isArray(json.posts)) return null
      cachedIndex = json
      return json
    } catch {
      return null
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

export function clearSearchIndexCache(): void {
  cachedIndex = null
}

function tokenizeKeywords(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 0)
}

function countOccurrences(text: string, keyword: string): number {
  if (!text) return 0
  const lower = text.toLowerCase()
  let count = 0
  let idx = lower.indexOf(keyword)
  while (idx !== -1) {
    count++
    idx = lower.indexOf(keyword, idx + keyword.length)
  }
  return count
}

/**
 * 本地全文搜索：标题/标签/摘要/内容 加权计分，返回排序后的结果。
 * 支持空格分隔的多关键词（须全部命中）。
 */
export async function searchStaticIndex(
  query: string,
  options?: { limit?: number }
): Promise<StaticSearchResult[] | null> {
  const limit = options?.limit ?? 50
  const index = await loadSearchIndex()
  if (!index) return null

  const keywords = tokenizeKeywords(query)
  if (keywords.length === 0) return []

  const results: StaticSearchResult[] = []

  for (const post of index.posts) {
    const title = post.title || ''
    const desc = post.description || ''
    const tags = (post.tags || []).join(' ')
    const location = post.location || ''
    const content = post.content || ''
    const haystack = `${title} ${desc} ${tags} ${location} ${content}`.toLowerCase()

    // 多关键词须全部命中
    if (!keywords.every((k) => haystack.includes(k))) continue

    let score = 0
    for (const k of keywords) {
      score += countOccurrences(title, k) * 100
      score += countOccurrences(tags, k) * 40
      score += countOccurrences(desc, k) * 20
      score += countOccurrences(location, k) * 15
      score += countOccurrences(content, k) * 5
    }

    results.push({
      id: post.id,
      slug: post.slug,
      title: post.title,
      date: post.date,
      description: post.description || undefined,
      tags: post.tags && post.tags.length > 0 ? post.tags : undefined,
      module: post.module,
      score,
    })
  }

  results.sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1))
  return results.slice(0, limit)
}
