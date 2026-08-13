import { getPostService } from '@/lib/container'

export const dynamic = 'force-dynamic'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  try {
    const siteTitle = process.env.NEXT_PUBLIC_SITE_TITLE || 'Travel-Notes'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const siteDescription = `${siteTitle} 旅行记录订阅`

    const postService = getPostService()
    const posts = (await postService.getPostsHybrid('travel')).slice(0, 20)

    const items = posts
      .map((post) => {
        const link = `${siteUrl}/travel/${post.slug}`
        return `
      <item>
        <title>${escapeXml(post.title)}</title>
        <link>${link}</link>
        <description>${escapeXml(post.description || '')}</description>
        <pubDate>${new Date(post.date).toUTCString()}</pubDate>
        <guid>${link}</guid>
      </item>`
      })
      .join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>zh-CN</language>${items}
  </channel>
</rss>`

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
      },
    })
  } catch (error: any) {
    console.error('[GET /feed.xml] Error:', error?.message || error)
    return new Response('Failed to generate feed', { status: 500 })
  }
}
