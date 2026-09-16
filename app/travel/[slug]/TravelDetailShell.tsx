'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { Calendar, MapPin, Users, PenLine } from 'lucide-react'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'
import TravelDetailClient from './TravelDetailClient'
import TravelTimeline from '@/components/travel/TravelTimeline'
import AsyncState from '@/components/AsyncState'
import dynamicImport from 'next/dynamic'
import { apiUrl } from '@/lib/api-base'
import { travelRecordHref } from '@/lib/routes'
import { TravelTypePill } from '@/components/mobile/Pills'
import { Icon } from '@/components/mobile/Icon'

// 仅本页渲染服务端生成的 Markdown HTML（含 KaTeX 公式 / 代码高亮）时按需加载样式
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const VideoPlayer = dynamicImport(() => import('@/components/VideoPlayer'))

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
          className="inline-flex items-center gap-2 rounded-full border border-travel-bloom/50 bg-travel-sakura px-4 py-3 text-sm font-medium text-travel-ink transition-all hover:bg-travel-bloom/25 active:scale-[0.98]"
        >
          <Icon icon={PenLine} size="sm" />
          记录今日
        </Link>
      </div>
      <div id={`detail-${slug}`} className="container-custom">
        <article className="mx-auto max-w-3xl pb-[calc(96px+env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] md:pb-16 md:pt-24">
          <header className="mb-8 text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-travel-ink">{detailTitle}</h1>
            {travel?.travelType && (
              <TravelTypePill type={travel.travelType} />
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
                      <Icon icon={Users} size="sm" className="text-travel-accentSoft" />
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
                  <Icon icon={Calendar} size="sm" />
                  {formatDate(detailDate)}
                </span>
              )}
              {detailLocation && (
                <span className="flex items-center gap-1">
                  <Icon icon={MapPin} size="sm" />
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

          {/*
            新建旅行的落地页：刚建好的旅行没有正文、没有照片，此前的页面只剩标题与日期，
            看起来像"没建成"。这里给一个最小引导 —— 一行说明 + 一个主动作，
            不做插画、不堆按钮（对齐 docs/design/新建旅行重构方案-参考圆周旅迹.md 的 M6 空态原则）。
          */}
          {!contentHtml && images.length === 0 && videos.length === 0 && (
            <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-travel-line/70 py-10 text-center">
              <p className="text-sm text-travel-ink/55">
                {detailLocation ? `「${detailLocation}」这段旅程还没有记录` : '这段旅程还没有记录'}
              </p>
              <Link
                href={travelRecordHref(slug)}
                className="inline-flex items-center gap-2 rounded-2xl bg-travel-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-travel-accentStrong active:scale-[0.98]"
              >
                <Icon icon={PenLine} size="sm" />
                记录今天
              </Link>
              <p className="text-xs text-travel-ink/40">也可以往下按天添加行程与照片</p>
            </div>
          )}

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
