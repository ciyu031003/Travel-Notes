import type { Metadata } from 'next'
import TravelDetailShell from './TravelDetailShell'
import { getTravelBySlug } from '@/lib/modules/travel/travel.service'

/**
 * P1-21：旅行详情页（/travel/<slug>）的 metadata / OG 与 canonical。
 *
 * 与 circle 详情同策略：页面保持客户端壳（静态壳跨域读 API 的既有架构不动），
 * 服务端只补标题/摘要/封面/规范化链接。取数走公开视角（userId=null），
 * getTravelBySlug 内部已处理 SKIP_DB_ON_BUILD 与可见性（只返回公开数据）。
 *
 * 注意：query 入口 /travel/detail?slug= 与路径入口共用同一实体，canonical 统一
 * 指向路径入口，避免同一内容两套 URL 被重复收录。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  try {
    const travel = await getTravelBySlug(slug, null)
    if (!travel) return {}
    const title = (travel.title || '').trim() || '旅行详情'
    const dateRange = [travel.startDate, travel.endDate]
      .filter(Boolean)
      .map((d) => String(d).slice(0, 10))
      .join(' – ')
    const description =
      (travel.description || '').trim() ||
      `${title}${dateRange ? ` · ${dateRange}` : ''} · 甜途旅行记忆`
    const image = typeof travel.coverUrl === 'string' && travel.coverUrl ? travel.coverUrl : undefined
    return {
      title,
      description,
      alternates: { canonical: `/travel/${encodeURIComponent(slug)}` },
      openGraph: {
        type: 'article',
        title,
        description,
        url: `/travel/${encodeURIComponent(slug)}`,
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
    console.error('[travel/[slug]] generateMetadata 失败:', e)
    return {}
  }
}

export default function Page() {
  return <TravelDetailShell />
}
