import type { Metadata } from 'next'
import CirclePostShell from './CirclePostShell'
import { getSocialPost } from '@/lib/modules/social/social.service'

/**
 * P1-21：公开旅行帖详情页的 metadata / OG。
 *
 * 页面本身仍是**客户端壳**（交互与离线逻辑都在 PostDetail 里），这里只补服务端
 * 生成的部分：标题/摘要/封面/规范化链接。生成失败（无 DB、帖子不存在、非公开）
 * 一律返回空对象 → 由根 layout 的默认 title/OG 兜底，绝不因 SEO 让页面 500。
 *
 * 不读 cookies：只用匿名视角（userId=null）取公开数据，未公开内容不会出现在 metadata 里。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ postId: string }>
}): Promise<Metadata> {
  const { postId } = await params
  const id = Number.parseInt(postId, 10)
  if (!Number.isFinite(id) || id <= 0) return {}

  // 构建期跳过 DB（与 lib/db-guard 的约定一致）：避免低内存构建时因连库超时拖慢/失败
  if (process.env.SKIP_DB_ON_BUILD === '1') return {}

  try {
    const post = await getSocialPost(id, null)
    if (!post) return {}
    const title = (post.title || '').trim() || '旅行圈'
    const description = (post.summary || '').trim() || `${title} · 甜途旅行圈`
    const image = typeof post.coverUrl === 'string' && post.coverUrl ? post.coverUrl : undefined
    return {
      title,
      description,
      alternates: { canonical: `/circle/${id}` },
      openGraph: {
        type: 'article',
        title,
        description,
        url: `/circle/${id}`,
        ...(image ? { images: [{ url: image, alt: title }] } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    }
  } catch (e) {
    // 降级到根 layout 的默认 metadata，不让 SEO 取值失败影响页面
    console.error('[circle/[postId]] generateMetadata 失败:', e)
    return {}
  }
}

export default function Page() {
  return <CirclePostShell />
}
