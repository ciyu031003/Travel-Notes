'use client'

import { useState } from 'react'
import { Plus, Loader2, Sparkles, X } from 'lucide-react'
import { createTravel } from '@/lib/modules/offline/travel-write'

const TRAVEL_TYPES: { value: string; label: string }[] = [
  { value: 'ALONE', label: '独旅' },
  { value: 'COUPLE', label: '情侣' },
  { value: 'FAMILY', label: '家庭' },
  { value: 'FRIENDS', label: '朋友' },
  { value: 'BFF', label: '闺蜜/兄弟' },
  { value: 'GROUP', label: '结伴' },
  { value: 'OTHER', label: '其他' },
]

/**
 * 新建旅行：离线时本地乐观写 + 入同步队列（联网自动上传云端），在线直接创建。
 * 移动端不设 /admin，此即 /travel 模块内的新建入口。
 */
export default function TravelComposer({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [travelType, setTravelType] = useState('ALONE')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setMessage(null)
    const r = await createTravel({
      title: title.trim(),
      description: description.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      travelType: travelType as never,
    })
    if (r.ok) {
      setTitle('')
      setDescription('')
      setStartDate('')
      setEndDate('')
      setTravelType('ALONE')
      setMessage({ type: 'ok', text: r.local ? '已保存到本地，联网后自动上传' : '创建成功' })
      onCreated?.()
      setTimeout(() => {
        setOpen(false)
        setMessage(null)
      }, 1200)
    } else {
      setMessage({ type: 'err', text: r.error || '创建失败' })
    }
    setSubmitting(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-travel-bloom px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-[#DDA5B2]"
      >
        <Plus className="h-4 w-4" />
        新建旅行
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="relative w-full max-w-md rounded-2xl border border-travel-dim bg-travel-cream p-4 shadow-lg"
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute right-2 top-2 rounded-full p-1 text-travel-ink/50 hover:bg-travel-dim/50"
        aria-label="关闭"
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="mb-3 font-semibold text-travel-ink">新建旅行</h3>
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="旅行名称（必填）"
          className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-bloom"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="描述（可选）"
          className="w-full resize-none rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-bloom"
        />
        <div>
          <span className="mb-1.5 block text-xs text-travel-ink/60">这次旅行是？</span>
          <div className="flex flex-wrap gap-1.5">
            {TRAVEL_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTravelType(t.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  travelType === t.value
                    ? 'bg-travel-bloom text-white'
                    : 'bg-travel-dim/40 text-travel-ink/70 hover:bg-travel-dim/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-travel-ink/60">开始日期</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none focus:border-travel-bloom"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-travel-ink/60">结束日期</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none focus:border-travel-bloom"
            />
          </label>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        {message && (
          <p className={`flex items-center gap-1.5 text-xs ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
            <Sparkles className="h-3 w-3" />
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-travel-bloom px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#DDA5B2] disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          保存
        </button>
      </div>
    </form>
  )
}
