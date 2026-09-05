'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { Calendar, MapPin, Users } from 'lucide-react'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'
import TravelDetailClient from './TravelDetailClient'
import TravelTimeline from '@/components/travel/TravelTimeline'
import AsyncState from '@/components/AsyncState'
import dynamicImport from 'next/dynamic'
import { apiUrl } from '@/lib/api-base'
import { travelRecordHref } from '@/lib/routes'

const VideoPlayer = dynamicImport(() => import('@/components/VideoPlayer'))

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  ALONE: '独旅', COUPLE: '情侣', FAMILY: '家庭', FRIENDS: '朋友', BFF: '闺蜜/兄弟', GROUP: '结伴', OTHER: '其他',
}
const TRAVEL_TYPE_STYLES: Record<string, string> = {
  ALONE: 'bg-travel-mist/50 text-travel-sky',
  COUPLE: 'bg-travel-sakura/60 text-travel-accent',
  FAMILY: 'bg-travel-sakura/50 text-travel-accentStrong',
  FRIENDS: 'bg-travel-mist/40 text-travel-sky',
  BFF: 'bg-travel-sakura/50 text-travel-accent',
  GROUP: 'bg-travel-mist/50 text-travel-sky',
  OTHER: 'bg-travel-dim/40 text-travel-ink/70',
}

interface DetailData {
  travel: {
    id: number
    title: string
    slug: string
    description: string | null
    startDate: string | null
    status: string
    contentHtml: string
    tags: string[] | null
    location: string | null
    cover: string | null
    travelType?: string | null
    companions?: unknown
  } | null
  legacy: {
    id: number
    title: string
    description: string | null
    location: string | null
    date: string
    images: string[]
    videos: any[]
    contentHtml: string
  } | null
  images: string[]
  videos: any[]
}

export default function TravelDetailShell({ slugProp }: { slugProp?: string }) {
  const params = useParams<{ slug: string }>()
  const slug = slugProp ? decodeURIComponent(slugProp) : decodeURIComponent(params?.slug || '')
  const [data, setData] = useState<DetailData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    fetch(apiUrl('/api/travels/by-slug/' + encodeURIComponent(slug) + '/detail'), { credentials: 'include' })
      .then((r) => r.json())
      .then((j: DetailData) => {
        if (j?.travel || j?.legacy) setData(j)
        else setError('旅行不存在')
      })
      .catch(() => setError('网络错误，请稍后重试'))
  }, [slug])

  if (error) {
    return <AsyncState variant="error" message={error} title="旅行加载失败" />
  }
  if (!data) {
    return <AsyncState variant="loading" message="正在翻开这本旅行相册…" />
  }

  const travel = data.travel
  const legacy = data.legacy
  const images = data.images || []
  const videos = data.videos || []
  const detailTitle = travel?.title ?? legacy?.title ?? ''
  const detailDescription = travel?.description ?? legacy?.description ?? undefined
  const detailLocation = travel?.location ?? legacy?.location ?? undefined
  const detailDate = travel?.startDate ?? legacy?.date ?? ''
  const detailTags = travel?.tags ?? null
  const contentHtml = travel?.contentHtml ?? legacy?.contentHtml ?? ''

  const imageProps = {
    images,
    videos,
    title: detailTitle,
    description: detailDescription,
    location: detailLocation,
    date: detailDate,
    postSlug: slug,
  }

  return (
    <div className="bg-travel-cream min-h-screen">
      {(images.length > 0 || videos.length > 0) && <TravelDetailClient {...imageProps} />}

      <div className="container-custom pt-6">
        <Link
          href={travelRecordHref(slug)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-travel-sakura border border-travel-bloom/50 text-travel-ink rounded-full text-sm font-medium hover:bg-[#EED2D8] transition-colors"
        >
          ✍️ 记录今日
        </Link>
      </div>
      <div id={`detail-${slug}`} className="container-custom">
        <article className="max-w-3xl mx-auto pt-24 pb-16">
          <header className="mb-8 text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-travel-ink">{detailTitle}</h1>
            {travel?.travelType && (
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${TRAVEL_TYPE_STYLES[travel.travelType] || TRAVEL_TYPE_STYLES.OTHER}`}>
                {TRAVEL_TYPE_LABELS[travel.travelType] || travel.travelType}
              </span>
            )}
            {Array.isArray(travel?.companions) && (travel.companions as any[]).length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {(travel.companions as any[]).map((c, i) => {
                  const name = String(c?.name || '').trim()
                  if (!name) return null
                  const relation = String(c?.relation || '').trim()
                  return (
                    <span
                      key={`${name}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full border border-travel-bloom/40 bg-travel-sakura/30 px-3 py-1 text-xs text-travel-ink"
                    >
                      <Users className="h-3 w-3 text-travel-accentSoft" />
                      {name}
                      {relation ? <span className="text-travel-ink/50">· {relation}</span> : null}
                    </span>
                  )
                })}
              </div>
            )}
            <div className="flex items-center justify-center gap-4 text-travel-ink/60 text-sm mt-2">
              {detailDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(detailDate)}
                </span>
              )}
              {detailLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {detailLocation}
                </span>
              )}
            </div>
            {detailTags && detailTags.length > 0 && (
              <div className="flex justify-center gap-2 mt-4">
                {detailTags.map((tag: string) => (
                  <span key={tag} className="px-3 py-1 bg-travel-sakura/40 border border-travel-bloom/50 text-travel-ink text-xs rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          {videos.length > 0 && (
            <div className="mb-8">
              <VideoPlayer videos={videos} className="aspect-video" />
            </div>
          )}

          <div
            className="prose prose-lg max-w-none prose-headings:text-travel-ink prose-p:text-travel-ink/80 prose-a:text-travel-bloom"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          {/* v3.1 M1-A4：按天叙事时间线（仅新 Travel 模型有按天数据） */}
          {travel?.id && (
            <div className="mt-10">
              <TravelTimeline travelId={travel.id} />
            </div>
          )}

          <MermaidRenderer />
        </article>
      </div>
    </div>
  )
}
