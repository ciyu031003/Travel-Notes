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
    <div className="min-h-screen bg-travel-cream">
      <header className="sticky top-0 z-10 border-b border-[#E8E8E4] bg-travel-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link href={travelDetailHref(slug)} className="-ml-2 p-2 text-travel-ink" aria-label="返回">
            <Icon icon={ArrowLeft} size="md" />
          </Link>
          <h1 className="font-semibold text-travel-ink">记录此刻 · {travel.title}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        {offline && (
          <div className="mb-4 rounded-2xl border border-travel-bloom/40 bg-travel-bloom/15 px-4 py-2 text-center text-xs text-[#B07686]">
            离线模式：保存的留言会先存到本地，联网后自动上传
          </div>
        )}
        {success ? (
          <div className="card flex flex-col items-center gap-2 p-8 text-center text-green-600">
            <Icon icon={Sparkles} size="md" />
            {success}
          </div>
        ) : travel.pendingSync ? (
          <div className="card p-8 text-center text-travel-ink/70">
            这本旅行还在本地待同步，联网后会自动上传。同步完成即可在这里记录。
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-travel-ink/70">此刻标题</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={255}
                placeholder="比如：今天看到的海"
                className="w-full rounded-2xl border border-travel-bloom/50 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-travel-bloom/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-travel-ink/70">写点什么</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder="此刻的心情、发生的事…"
                className="w-full resize-none rounded-2xl border border-travel-bloom/50 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-travel-bloom/60"
              />
            </div>

            {/* 照片：本页此前完全没有这块 */}
            <div>
              <label className="mb-2 block text-sm text-travel-ink/70">
                照片<span className="ml-1 text-xs text-travel-ink/40">最多 {MAX_PHOTOS} 张</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={'data:' + p.mimeType + ';base64,' + p.base64} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="移除这张照片"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white active:scale-95"
                    >
                      <Icon icon={X} size="sm" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={addPhotos}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-travel-bloom/50 text-travel-ink/50 active:scale-95"
                  >
                    <Icon icon={ImagePlus} size="md" />
                    <span className="text-[11px]">添加照片</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-travel-ink/70">心情</label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(mood === m ? '' : m)}
                    className={
                      'rounded-full border px-4 py-2 text-sm transition-colors ' +
                      (mood === m
                        ? 'border-travel-bloom bg-travel-sakura text-travel-ink'
                        : 'border-[#E8E8E4] bg-white text-travel-ink/70')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-travel-sakura bg-travel-sakura/50 px-4 py-3 text-sm text-travel-accentStrong">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-travel-bloom to-[#D4A5B0] py-3 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? progress || '保存中...' : (<><Icon icon={Send} size="sm" />保存回忆</>)}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
