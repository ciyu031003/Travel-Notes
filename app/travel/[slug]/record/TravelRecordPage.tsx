'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Send, Sparkles } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalTravelBySlug } from '@/lib/modules/offline/travel-read'
import { createMemory } from '@/lib/modules/offline/memory-write'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { travelDetailHref } from '@/lib/routes'

interface TravelInfo {
  id: number | string
  title: string
  slug: string
  spaceId: number | null
  /** 本地尚未同步到云端时不能提交（服务端不知道这本书） */
  pendingSync?: boolean
}

const MOODS = ['开心', '幸福', '想念', '期待', '平静', '累']

export default function TravelRecordPage({ slugProp = '' }: { slugProp?: string }) {
  const params = useParams<{ slug: string }>()
  const slug = slugProp || params.slug || ''
  const router = useRouter()
  const [travel, setTravel] = useState<TravelInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const travelId = Number(travel!.id)
      if (!Number.isFinite(travelId)) {
        setError('该旅行尚未同步到云端，暂时无法留言')
        setSubmitting(false)
        return
      }
      const r = await createMemory({
        travelId,
        title,
        content: content || undefined,
        mood: mood || undefined,
      })
      if (r.ok) {
        setSuccess(true)
        setTimeout(() => router.push(travelDetailHref(slug)), 1200)
      } else {
        setError(r.error || '保存失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="container-custom py-20 text-center text-travel-sand"><Icon icon={Loader2} size="lg" className="animate-spin mx-auto mb-3" />加载中...</div>
  }

  if (!travel) {
    return <div className="container-custom py-20 text-center text-travel-sand">旅行不存在</div>
  }

  return (
    <div className="min-h-screen bg-travel-cream">
      <header className="sticky top-0 z-10 bg-travel-cream/90 backdrop-blur border-b border-[#E8E8E4]">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={travelDetailHref(slug)} className="p-2 -ml-2 text-travel-ink">
            <Icon icon={ArrowLeft} size="md" />
          </Link>
          <h1 className="font-semibold text-travel-ink">记录此刻 · {travel.title}</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {offline && (
          <div className="mb-4 rounded-2xl bg-travel-bloom/15 border border-travel-bloom/40 px-4 py-2 text-center text-xs text-[#B07686]">
            离线模式：保存的留言会先存到本地，联网后自动上传
          </div>
        )}
        {success ? (
          <div className="card p-8 text-center text-green-600 flex flex-col items-center gap-2">
            <Icon icon={Sparkles} size="md" />
            {isNativePlatform() && !navigator.onLine ? '已保存到本地，联网后自动上传' : '已保存，即将返回…'}
          </div>
        ) : travel.pendingSync ? (
          // 本地新书还没同步上云：服务端不认识它，写不进去。如实说明而不是假装失败。
          // （旧代码判的是 `travel.spaceId`，而个人旅行本来就没有空间 —— 于是所有
          //   个人旅行在这页都被拦成"请先在后台关联空间"，等于整页不可用。）
          <div className="card p-8 text-center text-travel-ink/70">
            这本旅行还在本地待同步，联网后会自动上传。同步完成即可在这里记录。
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm text-travel-ink/70 mb-1">此刻标题</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={255}
                placeholder="比如：今天看到的海"
                className="w-full px-4 py-3 rounded-2xl border border-travel-bloom/50 bg-white focus:outline-none focus:ring-2 focus:ring-travel-bloom/60"
              />
            </div>
            <div>
              <label className="block text-sm text-travel-ink/70 mb-1">写点什么</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder="此刻的心情、发生的事…"
                className="w-full px-4 py-3 rounded-2xl border border-travel-bloom/50 bg-white focus:outline-none focus:ring-2 focus:ring-travel-bloom/60 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-travel-ink/70 mb-2">心情</label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(m)}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${mood === m ? 'bg-travel-sakura border-travel-bloom text-travel-ink' : 'bg-white border-[#E8E8E4] text-travel-ink/70'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="px-4 py-3 bg-travel-sakura/50 border border-travel-sakura text-travel-accentStrong rounded-2xl text-sm">{error}</div>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-travel-bloom to-[#D4A5B0] text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? '保存中...' : <><Icon icon={Send} size="sm" />保存回忆</>}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
