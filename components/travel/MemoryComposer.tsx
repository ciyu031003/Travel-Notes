'use client'

import { useState } from 'react'
import { Check, ImagePlus, Loader2, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { base64ToBytes, extFromMime, pickImage, type PickedImage } from '@/lib/media/pick-image'

/**
 * 「记一笔」：在某个「天」下新建一条回忆，并可同时上传照片。
 *
 * 为什么需要：
 *  · 详情页原先只有一条「记录今日」链接跳到旧表单，旧表单**不收照片**；
 *  · 已有的 `MemoryPhotoPicker` 只能从相册里挑已有照片，不能上传。
 * 于是「建完旅行 → 传照片 → 记景点」这条核心路径在 App 里走不通。
 *
 * 这里把「写文字 + 传照片」合成一步：**先建回忆拿到 id，再上传照片关联**。
 * 关键：`happenedAt` 必须取**该天的日期**，否则回忆会落到"今天"那一天，
 * 而不是用户点「记一笔」的那一天（时间线按天分组，落错天就等于没记上）。
 */

const MOODS = ['开心', '幸福', '想念', '期待', '平静', '累']

export default function MemoryComposer({
  travelId,
  dayId,
  dayLabel,
  dayDate,
  onClose,
  onDone,
}: {
  travelId: number
  /** 关联到哪一天；null 表示这一天还不存在 —— 服务端会补出第一天再挂上去（可空） */
  dayId: number | null
  dayLabel: string
  /** 该天的日期（ISO 或 YYYY-MM-DD）；用于把回忆记到正确的当天 */
  dayDate?: string | null
  onClose: () => void
  onDone?: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('')
  const [photos, setPhotos] = useState<PickedImage[]>([])
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const addPhotos = async () => {
    const p = await pickImage('photos')
    if (!p) return
    setPhotos((prev) => [...prev, p].slice(0, 9))
  }

  const submit = async () => {
    if (!title.trim()) {
      setError('写个标题吧，比如「在喀纳斯的第一天」')
      return
    }
    setSaving(true)
    setError('')
    try {
      // ① 建回忆（文字）
      setProgress('正在保存…')
      const res = await fetch(apiUrl(`/api/travels/${travelId}/memories`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim() || null,
          mood: mood || null,
          // 关键：挂到「那一天」本身，否则时间线按天分组时不会出现在该天
          travelDayId: dayId ?? undefined,
          // 落到该天：没有 dayDate 时才交给服务端用"现在"
          happenedAt: dayDate ? new Date(dayDate).toISOString() : undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '保存失败')
      const memoryId = Number(j?.memoryId)
      if (!Number.isFinite(memoryId)) throw new Error('保存失败')

      // ② 上传照片（有则传；失败不丢文字，只提示）
      if (photos.length > 0) {
        setProgress(`正在上传 ${photos.length} 张照片…`)
        const form = new FormData()
        for (const p of photos) {
          const bytes = base64ToBytes(p.base64)
          form.append('files', new Blob([bytes as unknown as BlobPart], { type: p.mimeType }), `photo-${p.id}.${extFromMime(p.mimeType)}`)
        }
        const up = await fetch(apiUrl(`/api/memories/${memoryId}/photos`), {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
        if (!up.ok) {
          const uj = await up.json().catch(() => ({}))
          toast.error(`文字已保存，照片上传失败：${uj?.error || up.status}`)
        }
      }

      toast.success('已记录')
      onDone?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
      setProgress('')
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="记一笔">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--m-surface-solid)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 shadow-[var(--m-shadow-lg)]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[17px] font-semibold text-[var(--m-text)]">记一笔</h3>
            <p className="mt-0.5 text-[12px] text-[var(--m-muted)]">{dayLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-2 text-[var(--m-muted)] active:scale-95">
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">这一刻</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如 在喀纳斯的第一天"
              maxLength={80}
              className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[16px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">想说的话</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="路上的见闻、心情……（可选）"
              className="mt-2 w-full resize-none rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
          </label>

          <div>
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">心情（可选）</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(mood === m ? '' : m)}
                  aria-pressed={mood === m}
                  className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
                    mood === m
                      ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]'
                      : 'border-[var(--m-line)] text-[var(--m-muted)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* 照片：这一步是原先完全缺失的能力 */}
          <div>
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">
              照片
              <span className="ml-1 font-normal text-[var(--m-faint)]">最多 9 张</span>
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:${p.mimeType};base64,${p.base64}`} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="移除这张照片"
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white active:scale-95"
                  >
                    <Icon icon={X} size="sm" />
                  </button>
                </div>
              ))}
              {photos.length < 9 && (
                <button
                  type="button"
                  onClick={addPhotos}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--m-line)] text-[var(--m-faint)] active:scale-95"
                >
                  <Icon icon={ImagePlus} size="md" />
                  <span className="text-[11px]">添加照片</span>
                </button>
              )}
            </div>
          </div>

          {error && <p role="alert" className="text-[13px] text-[var(--m-danger,#d9534f)]">{error}</p>}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--m-accent)] text-[15px] font-semibold text-[var(--m-on-accent)] transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Icon icon={Loader2} size="md" className="animate-spin" /> : <Icon icon={Check} size="sm" />}
          {progress || (saving ? '保存中…' : '保存')}
        </button>
      </div>
    </div>
  )
}
