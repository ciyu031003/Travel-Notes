'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2, X, Check } from 'lucide-react'
import { apiUrl } from '@/lib/api-base'

interface CandidatePhoto {
  id: number
  url: string
  width: number | null
  height: number | null
  primaryMemoryId: number | null
}

/**
 * v3.1 M2-A2：给回忆关联照片（从用户相册媒体中选择，支持多选；一张照片可关联多个回忆）。
 */
export default function MemoryPhotoPicker({
  memoryId,
  onDone,
}: {
  memoryId: number
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<CandidatePhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/memories/media-candidates?limit=50'), { credentials: 'include' })
      const j = await res.json()
      setPhotos(j.media || [])
    } catch {
      setMessage({ type: 'err', text: '照片加载失败' })
    } finally {
      setLoading(false)
    }
  }

  const openPicker = () => {
    setOpen(true)
    setSelected(new Set())
    setMessage(null)
    load()
  }

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (selected.size === 0) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(apiUrl(`/api/memories/${memoryId}/media`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds: Array.from(selected) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '关联失败')
      setMessage({ type: 'ok', text: `已关联 ${selected.size} 张照片` })
      setTimeout(() => {
        setOpen(false)
        onDone?.()
      }, 900)
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message || '关联失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#E8B8C2]/30 px-2.5 py-1 text-xs text-[#5A6670]/80 transition hover:bg-[#E8B8C2]/50"
      >
        <Plus className="h-3 w-3" />
        关联照片
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-[#5A6670]">选择照片关联到回忆</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-[#5A6670]/50 hover:bg-gray-100" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-10 text-[#5A6670]/50"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : photos.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#5A6670]/50">还没有可关联的照片，先去相册上传吧</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {photos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={`relative aspect-square overflow-hidden rounded-lg transition ${selected.has(p.id) ? 'ring-2 ring-[#E8B8C2]' : 'ring-1 ring-gray-200'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {selected.has(p.id) && (
                        <span className="absolute inset-0 flex items-center justify-center bg-[#E8B8C2]/40">
                          <Check className="h-5 w-5 text-white" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {message && <p className={`mt-2 text-center text-xs ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>{message.text}</p>}

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-[#5A6670]/50">已选 {selected.size} 张</span>
              <button
                type="button"
                onClick={save}
                disabled={saving || selected.size === 0}
                className="rounded-full bg-[#E8B8C2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#DDA5B2] disabled:opacity-50"
              >
                {saving ? '关联中...' : '关联照片'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
