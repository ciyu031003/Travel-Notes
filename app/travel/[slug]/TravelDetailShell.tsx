'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { Calendar, MapPin, Users, PenLine, Pencil, ChevronLeft } from 'lucide-react'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'
import TravelTimeline from '@/components/travel/TravelTimeline'
import TravelInfoEditor from '@/components/travel/TravelInfoEditor'
import AsyncState from '@/components/AsyncState'
import dynamicImport from 'next/dynamic'
import { apiUrl } from '@/lib/api-base'
import { travelDetailHref, travelRecordHref } from '@/lib/routes'
import { TravelTypePill } from '@/components/mobile/Pills'
import { Icon } from '@/components/mobile/Icon'
import { IconButton } from '@/components/mobile/IconButton'
import { hapticLight } from '@/lib/mobile/haptics'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalTravelBySlug } from '@/lib/modules/offline/travel-read'
import { getSyncEngine, startSyncEngine } from '@/lib/modules/offline/bootstrap'
import TravelDetailMobile from './TravelDetailMobile'
import TravelPhotoViewer, { type ViewerPhoto } from './TravelPhotoViewer'
import type { TravelInfoForDetail } from '@/components/travel/detail/types'

// 仅本页渲染服务端生成的 Markdown HTML（含 KaTeX 公式 / 代码高亮）时按需加载样式
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const VideoPlayer = dynamicImport(() => import('@/components/VideoPlayer'))

/** 断点与 Tailwind 的 md（768px）对齐：<768 视为移动端 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMobile
}

interface LegacyDetail {
  id: number
  title: string
  description: string | null
  location: string | null
  date: string
  images: string[]
  videos: unknown[]
  contentHtml: string
}

interface DetailData {
  travel: TravelInfoForDetail | null
  legacy: LegacyDetail | null
  images: string[]
  videos: unknown[]
}

/**
 * 旅行详情外壳：负责取数与降级，然后分派到两套排版。
 *
 * 本次重构的三处关键修复都在这里：
 *  1. **本地兜底** —— 原生壳新建的旅行先落 SQLite、后同步上云；此前只 fetch 远端，
 *     于是「刚建完打开详情」必然是「旅行不存在」（真机反馈的"建完就没下文"）。
 *     现在走 readWithFallback：远端失败或离线时用本地行渲染，并明确标注"待同步"。
 *  2. **移动端换成四 tab 信息架构**（总览 / 行程 / 相册 / 花销），不再是一页相册。
 *  3. **全屏相册降级为二级视图** —— 它此前是 fixed inset-0 z-50 且没有关闭按钮，
 *     把同页的"编辑信息 / 记一笔 / 添加行程"全部盖死，是三个入口都找不到的总根因。
 */
export default function TravelDetailShell({ slugProp }: { slugProp?: string }) {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = slugProp ? decodeURIComponent(slugProp) : decodeURIComponent(params?.slug || '')
  const [data, setData] = useState<DetailData | null>(null)
  const [error, setError] = useState('')
  const [offlineLocal, setOfflineLocal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; index: number } | null>(null)

  const handleBack = useCallback(() => {
    void hapticLight()
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/travel')
  }, [router])

  useEffect(() => {
    if (!slug) return
    let alive = true
    setError('')
    // 记录远端失败原因：本地兜底也拿不到数据时，要给出**真实原因**而不是笼统的「网络错误」
    let remoteStatus = 0
    let remoteThrew = false
    readWithFallback<DetailData>(
      async () => {
        let res: Response
        try {
          res = await fetch(apiUrl('/api/travels/by-slug/' + encodeURIComponent(slug) + '/detail'), {
            credentials: 'include',
          })
        } catch (e) {
          // fetch 本身抛错 = 网络不可达（与 HTTP 错误区分开）
          remoteThrew = true
          throw e
        }
        remoteStatus = res.status
        if (!res.ok) throw new Error('http ' + res.status)
        const j = (await res.json()) as DetailData & { error?: string }
        if (!(j?.travel || j?.legacy)) throw new Error(String(j?.error || '旅行不存在'))
        return j as DetailData
      },
      async () => {
        // 本地 SQLite 兜底：离线新建、或云端还没有这本旅行时，页面仍然可看、可理解状态
        const local = await readLocalTravelBySlug(slug)
        if (!local) return null
        return {
          travel: {
            // 0 表示"云端还不存在"：所有写操作按此禁用（见 TravelDetailMobile 的 canWrite）
            id: local.remoteId ?? 0,
            title: local.title,
            slug: local.slug,
            description: local.description ?? null,
            startDate: local.startDate ?? null,
            endDate: local.endDate ?? null,
            contentHtml: '',
            tags: null,
            location: local.location ?? null,
            cover: local.cover ?? null,
            travelType: local.travelType ?? null,
            companions: local.companions ?? null,
            budget: local.budget ?? null,
            canEdit: true,
            pendingSync: local.pendingSync,
          },
          legacy: null,
          images: local.cover ? [local.cover] : [],
          videos: [],
        } as DetailData
      },
    )
      .then((r) => {
        if (!alive) return
        setData(r.data)
        setOfflineLocal(r.source === 'local')
      })
      .catch((e: unknown) => {
        if (!alive) return
        /**
         * 这里曾经把所有失败都写成「网络错误，请稍后重试」—— 于是真机上
         * 「本地表缺列导致兜底读不到」被误报成网络问题，用户和我都被这句话带偏。
         * 现在按真实原因分派文案，并在副标题里带上状态码，便于排查。
         */
        if (e instanceof Error && e.message === '旅行不存在') {
          setError('旅行不存在')
          return
        }
        if (remoteStatus === 404) {
          setError('这本旅行在服务器上不存在，本机也没有它的离线副本')
          return
        }
        if (remoteStatus === 401 || remoteStatus === 403) {
          setError(`没有权限查看这本旅行（HTTP ${remoteStatus}）`)
          return
        }
        if (remoteStatus >= 500) {
          setError(`服务器出错（HTTP ${remoteStatus}），请稍后重试`)
          return
        }
        setError(remoteThrew || remoteStatus === 0 ? '网络不可用，请检查连接后重试' : '加载失败，请重试')
      })
    return () => {
      alive = false
    }
  }, [slug, reloadToken])

  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  /** 「立即同步」：手动跑一轮上传（离线创建的旅行卡在待同步时用），成功后重载详情 */
  const syncNow = useCallback(async () => {
    try {
      await startSyncEngine()
      const engine = getSyncEngine()
      if (!engine) return
      await engine.sync()
      reload()
    } catch {
      // 同步失败保持原状态；横幅上的说明已经足够
    }
  }, [reload])

  /**
   * 移动 / 桌面只渲染一支。
   *
   * 为什么不用 CSS 双向渲染（hidden md:block + md:hidden）：那样两个分支都会挂载 ——
   * 页面上会出现**两个 h1**（无障碍与 E2E 的 strict 模式都会炸），而且
   * 桌面分支的 TravelTimeline 会在手机上空跑一次时间线请求。
   * 断点与 Tailwind 的 md 对齐（768px），与 TravelClient 的既有判断同口径。
   */
  const isMobile = useIsMobile()

  /**
   * 保存后：标题变化会连带 slug 变化（服务端重算），此时必须换地址再整页重载，
   * 否则用户刷新就 404。没变 slug 也重载一次 —— 时间线的「天」可能被区间调整过。
   */
  const handleSaved = (info: { slug: string; local: boolean }) => {
    if (info.slug && info.slug !== slug) {
      window.location.replace(travelDetailHref(info.slug))
      return
    }
    reload()
  }

  if (error) {
    return (
      <AsyncState
        variant="error"
        message={error}
        title="旅行加载失败"
        actionLabel="重试"
        onAction={reload}
      />
    )
  }
  if (!data) {
    return <AsyncState variant="loading" message="正在翻开这本旅行相册…" />
  }

  const travel = data.travel
  const legacy = data.legacy
  const images = data.images || []
  const videos = data.videos || []
  const detailTitle = travel?.title ?? legacy?.title ?? ''
  const detailLocation = travel?.location ?? legacy?.location ?? undefined
  const detailDate = travel?.startDate ?? legacy?.date ?? ''
  const detailTags = travel?.tags ?? null
  const contentHtml = travel?.contentHtml ?? legacy?.contentHtml ?? ''
  const pendingSync = Boolean(travel?.pendingSync) || (offlineLocal && !travel?.id)

  const gridPhotos: ViewerPhoto[] = images.map((u) => ({ url: u }))

  return (
    <div className="bg-travel-cream min-h-screen">
      {/* 移动端：四 tab 信息架构（仅移动端挂载） */}
      {isMobile && travel && (
        <TravelDetailMobile
          slug={travel.slug || slug}
          travel={travel}
          images={images}
          pendingSync={pendingSync}
          onEdit={() => setEditing(true)}
          onBack={handleBack}
          onEditReload={reload}
          onSyncNow={syncNow}
          dataVersion={reloadToken}
        />
      )}

      {/*
        移动端旧文章（legacy Post，没有 Travel 行）：**必须有内容**。
        上一轮把正文只放在 !isMobile 的桌面分支里，导致这类旅行在手机上只剩一条返回栏、
        正文全空白 —— 真机反馈的"点开旅途整个页面空白"就是它。
      */}
      {isMobile && !travel && legacy && (
        <div className="bg-travel-cream">
          <div className="m-glass sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex h-14 items-center gap-1 px-2">
              <IconButton icon={ChevronLeft} label="返回旅行记录" variant="plain" onClick={handleBack} />
              <span className="m-body min-w-0 flex-1 truncate font-medium text-[var(--m-text)]">{detailTitle}</span>
            </div>
          </div>

          <div className="px-4 pb-[calc(120px+env(safe-area-inset-bottom))] pt-3">
            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {images.slice(0, 4).map((url, i) => (
                  <button
                    key={url + i}
                    type="button"
                    aria-label="全屏查看照片"
                    onClick={() => setViewer({ photos: gridPhotos, index: i })}
                    className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-travel-mist/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            <h1 className="mt-4 text-[24px] font-bold leading-tight text-travel-ink">{detailTitle}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-travel-ink/60">
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

            {videos.length > 0 && (
              <div className="mt-4">
                <VideoPlayer videos={videos as never[]} className="aspect-video" />
              </div>
            )}

            <div
              className="prose prose-sm mt-4 max-w-none prose-headings:text-travel-ink prose-p:text-travel-ink/80 prose-a:text-travel-bloom"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          </div>
        </div>
      )}

      {/* 桌面端：原有文章式排版（保持不动，降低回归面） */}
      {!isMobile && (
      <div>
        <div className="container-custom flex flex-wrap items-center gap-2 pt-6">
          <Link
            href={travelRecordHref(slug)}
            className="inline-flex items-center gap-2 rounded-full border border-travel-bloom/50 bg-travel-sakura px-4 py-3 text-sm font-medium text-travel-ink transition-all hover:bg-travel-bloom/25 active:scale-[0.98]"
          >
            <Icon icon={PenLine} size="sm" />
            记录今日
          </Link>
          {travel?.canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-full border border-travel-line/70 bg-white/70 px-4 py-3 text-sm font-medium text-travel-ink transition-all hover:bg-travel-sakura/40 active:scale-[0.98]"
            >
              <Icon icon={Pencil} size="sm" />
              编辑信息
            </button>
          )}
        </div>

        {/* 相册：桌面端改为普通网格 + 点击进沉浸视图（原先直接铺满全屏、且无关闭） */}
        {images.length > 0 && (
          <div className="container-custom mt-6">
            <div className="grid grid-cols-4 gap-2 lg:grid-cols-6">
              {images.slice(0, 12).map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => setViewer({ photos: gridPhotos, index: i })}
                  className="relative aspect-square overflow-hidden rounded-xl bg-travel-mist/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
            {images.length > 12 && (
              <button
                type="button"
                onClick={() => setViewer({ photos: gridPhotos, index: 0 })}
                className="mt-2 text-sm text-travel-accent hover:underline"
              >
                查看全部 {images.length} 张
              </button>
            )}
          </div>
        )}

        <div id={'detail-' + slug} className="container-custom">
          <article className="mx-auto max-w-3xl pb-16 pt-6">
            <header className="mb-8 text-center">
              <h1 className="mb-4 text-3xl font-bold text-travel-ink md:text-4xl">{detailTitle}</h1>
              {travel?.travelType && <TravelTypePill type={travel.travelType} />}
              {Array.isArray(travel?.companions) && (travel.companions as { name?: string; relation?: string }[]).length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {(travel.companions as { name?: string; relation?: string }[]).map((c, i) => {
                    const name = String(c?.name || '').trim()
                    if (!name) return null
                    const relation = String(c?.relation || '').trim()
                    return (
                      <span
                        key={name + '-' + i}
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
              <div className="mt-2 flex items-center justify-center gap-4 text-sm text-travel-ink/60">
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
                <div className="mt-4 flex justify-center gap-2">
                  {detailTags.map((tag: string) => (
                    <span
                      key={tag}
                      className="rounded-full border border-travel-bloom/50 bg-travel-sakura/40 px-3 py-1 text-xs text-travel-ink"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            {videos.length > 0 && (
              <div className="mb-8">
                <VideoPlayer videos={videos as never[]} className="aspect-video" />
              </div>
            )}

            <div
              className="prose prose-lg max-w-none prose-headings:text-travel-ink prose-p:text-travel-ink/80 prose-a:text-travel-bloom"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />

            {!contentHtml && images.length === 0 && videos.length === 0 && (
              <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-travel-line/70 py-10 text-center">
                <p className="text-sm text-travel-ink/55">
                  {detailLocation ? '「' + detailLocation + '」这段旅程还没有记录' : '这段旅程还没有记录'}
                </p>
                <Link
                  href={travelRecordHref(slug)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-travel-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-travel-accentStrong active:scale-[0.98]"
                >
                  <Icon icon={PenLine} size="sm" />
                  记录今天
                </Link>
              </div>
            )}

            {travel?.id ? (
              <div className="mt-10">
                <TravelTimeline travelId={travel.id} />
              </div>
            ) : null}

            <MermaidRenderer />
          </article>
        </div>
      </div>
      )}

      <TravelPhotoViewer
        open={Boolean(viewer)}
        photos={viewer?.photos ?? []}
        startIndex={viewer?.index ?? 0}
        title={detailTitle}
        onClose={() => setViewer(null)}
      />

      {editing && travel && (
        <TravelInfoEditor
          travelId={travel.id || null}
          slug={travel.slug || slug}
          initial={{
            title: travel.title,
            location: travel.location,
            description: travel.description,
            startDate: travel.startDate,
            endDate: travel.endDate,
          }}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      )}

    </div>
  )
}
