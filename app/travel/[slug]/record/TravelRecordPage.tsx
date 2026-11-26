'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ImagePlus, Loader2, Send, Sparkles, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalTravelBySlug } from '@/lib/modules/offline/travel-read'
import { createMemory } from '@/lib/modules/offline/memory-write'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { travelDetailHref } from '@/lib/routes'
import { base64ToBytes, extFromMime, pickImage, type PickedImage } from '@/lib/media/pick-image'

interface TravelInfo {
  id: number | string
  title: string
  slug: string
  spaceId: number | null
  /** 本地尚未同步到云端时不能提交（服务端不知道这本书） */
  pendingSync?: boolean
}

const MOODS = ['开心', '幸福', '想念', '期待', '平静', '累']
const MAX_PHOTOS = 9

/**
 * 「记录此刻」独立页（旧入口，保留兼容）。
 *
 * 本轮补齐了它最大的能力缺口：**照片**。
 * 此前这一页只有标题 / 正文 / 心情，完全不收照片，导致同一个产品里
 * 「记一笔」（TravelDetail 的 MemoryComposer，能传照片）与「记录今日」（本页，不能传）
 * 两套入口能力不一致 —— 用户从"记录今日"进来传不了图，自然会觉得"没有上传入口"。
 *
 * 上传依赖云端回忆 id：先建回忆，再 \`POST /api/memories/:id/photos\`（与记一笔同一管线）。
 * 离线本地写入拿不到 id，此时如实告知"照片会在同步后补传"，不假装成功。
 */
export default function TravelRecordPage({ slugProp = '' }: { slugProp?: string }) {
  const params = useParams<{ slug: string }>()
  const slug = slugProp || params.slug || ''
  const router = useRouter()
  const [travel, setTravel] = useState<TravelInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('')
  const [photos, setPhotos] = useState<PickedImage[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    readWithFallback<TravelInfo | null>(
      async () => {
        const res = await fetch(apiUrl('/api/travels/by-slug/' + encodeURIComponent(slug)), { credentials: 'include' })
        if (!res.ok) throw new Error('http ' + res.status)
        const data = await res.json()
        return data.travel || null
      },
      async () => {
        const local = await readLocalTravelBySlug(slug)
        return local
      },
    )
      .then((result) => {
        if (cancelled) return
        setTravel(result.data)
        setOffline(result.source === 'local')
      })
      .catch(() => {
        if (!cancelled) setTravel(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const addPhotos = async () => {
    const p = await pickImage('photos')
    if (!p) return
    setPhotos((prev) => [...prev, p].slice(0, MAX_PHOTOS))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const travelId = Number(travel!.id)
      if (!Number.isFinite(travelId)) {
        setError('该旅行尚未同步到云端，暂时无法记录')
        setSubmitting(false)
        return
      }
      setProgress('正在保存…')
      const r = await createMemory({
        travelId,
        title,
        content: content || undefined,
        mood: mood || undefined,
      })
      if (!r.ok) {
        setError(r.error || '保存失败')
        return
      }

      // 照片：与「记一笔」共用同一上传接口
      if (photos.length > 0) {
        if (r.local || !r.id) {
          setSuccess('文字已存到本地；照片会在联网同步后补传')
          setTimeout(() => router.push(travelDetailHref(slug)), 1600)
          return
        }
        setProgress('正在上传 ' + photos.length + ' 张照片…')
        const form = new FormData()
        for (const p of photos) {
          const bytes = base64ToBytes(p.base64)
          form.append(
            'files',
            new Blob([bytes as unknown as BlobPart], { type: p.mimeType }),
            'photo-' + p.id + '.' + extFromMime(p.mimeType),
          )
        }
        const up = await fetch(apiUrl('/api/memories/' + r.id + '/photos'), {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
        if (!up.ok) {
          setSuccess('文字已保存，照片上传失败，可在旅行相册里重传')
          setTimeout(() => router.push(travelDetailHref(slug)), 1600)
          return
        }
      }

      setSuccess(isNativePlatform() && !navigator.onLine ? '已保存到本地，联网后自动上传' : '已保存，即将返回…')
      setTimeout(() => router.push(travelDetailHref(slug)), 1200)
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSubmitting(false)
      setProgress('')
    }
  }

  if (loading) {
    return (
      <div className="container-custom py-20 text-center text-travel-sand">
        <Icon icon={Loader2} size="lg" className="mx-auto mb-3 animate-spin" />
        加载中...
      </div>
    )
  }

  if (!travel) {
    return <div className="container-custom py-20 text-center text-travel-sand">旅行不存在</div>
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[var(--m-bg)] pb-[calc(112px+env(safe-area-inset-bottom))] text-[var(--m-text)]">
      <header className="m2-topbar">
        <div className="m2-navbar">
          <span className="m2-navbar-side">
            <Link
              href={travelDetailHref(slug)}
              aria-label="返回旅行"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--m-text)]"
            >
              <Icon icon={ArrowLeft} size="md" />
            </Link>
          </span>
          <h1 className="m2-navbar-title">记录此刻</h1>
          <span className="m2-navbar-side" aria-hidden="true" />
        </div>
      </header>

      <main className="px-[18px] pt-4">
        <p className="mb-4 text-[12px] text-[var(--m-faint)]">{travel.title}</p>

        {offline && (
          <div className="mb-4 rounded-[12px] bg-[var(--m-tone-sun-bg)] px-4 py-2.5 text-center text-[12px] font-semibold text-[var(--m-tone-sun-fg)]">
            离线模式：保存的内容会先存到本地，联网后自动上传
          </div>
        )}

        {success ? (
          <div className="m2-card flex flex-col items-center gap-3 p-8 text-center">
            <span className="m2-icon-box m2-tone-mint h-14 w-14 rounded-[18px]">
              <Icon icon={Sparkles} size="lg" />
            </span>
            <p className="text-[15px] font-semibold text-[var(--m-text)]">{success}</p>
          </div>
        ) : travel.pendingSync ? (
          <div className="m2-card p-8 text-center text-[13px] leading-6 text-[var(--m-muted)]">
            这本旅行还在本地待同步
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <section className="m2-form-section">
              <h2 className="m2-form-section-title">这一刻</h2>
              <div>
                <label htmlFor="record-title" className="mb-2 block text-[13px] font-semibold text-[var(--m-muted)]">
                  标题
                </label>
                <input
                  id="record-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={255}
                  placeholder="比如：今天看到的海"
                  className="m2-input"
                />
              </div>
              <div>
                <label htmlFor="record-content" className="mb-2 block text-[13px] font-semibold text-[var(--m-muted)]">
                  写点什么
                </label>
                <textarea
                  id="record-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  placeholder="此刻的心情、发生的事…"
                  className="m2-input resize-none"
                  style={{ minHeight: 132 }}
                />
              </div>
            </section>

            <section className="m2-form-section">
              <h2 className="m2-form-section-title">
                照片
                <span className="ml-auto text-[11px] font-normal text-[var(--m-faint)]">最多 {MAX_PHOTOS} 张</span>
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative aspect-square overflow-hidden rounded-[12px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={'data:' + p.mimeType + ';base64,' + p.base64} alt="" width={400} height={400} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="移除这张照片"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white active:scale-95"
                    >
                      <Icon icon={X} size="sm" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={addPhotos}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-[var(--m-line-strong)] text-[var(--m-faint)] active:scale-95"
                  >
                    <Icon icon={ImagePlus} size="md" />
                    <span className="text-[11px]">添加照片</span>
                  </button>
                )}
              </div>
            </section>

            <section className="m2-form-section">
              <h2 className="m2-form-section-title">此刻心情</h2>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(mood === m ? '' : m)}
                    aria-pressed={mood === m}
                    className={
                      'min-h-[44px] rounded-full border px-4 text-[13px] font-semibold transition-colors ' +
                      (mood === m
                        ? 'border-transparent bg-[var(--m-grad-cta)] text-white'
                        : 'border-[var(--m-line-strong)] bg-[var(--m-surface-solid)] text-[var(--m-muted)]')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </section>

            {error && (
              <div className="rounded-[12px] bg-[var(--m-danger)]/10 px-4 py-3 text-[12px] font-semibold text-[var(--m-danger)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="m-btn m-btn-primary m-btn-lg m-btn-block"
            >
              {submitting ? progress || '保存中...' : (<><Icon icon={Send} size="sm" />保存回忆</>)}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
