'use client'

import { useState } from 'react'
import { Plus, Loader2, Sparkles, X } from 'lucide-react'
import { createAlbum } from '@/lib/modules/offline/album-write'

/**
 * 新建相册：离线时本地乐观写 + 入同步队列（联网自动上传云端），在线直接创建。
 * 移动端不设 /admin，此即相册模块内的新建入口。
 */
export default function AlbumComposer({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setMessage(null)
    const r = await createAlbum({
      title: title.trim(),
      description: description.trim() || undefined,
      date: date || undefined,
    })
    if (r.ok) {
      setTitle('')
      setDescription('')
      setDate('')
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
        className="inline-flex items-center gap-1.5 rounded-full bg-album-accent/90 px-3.5 py-1.5 text-sm font-bold text-white transition hover:bg-album-accent"
      >
        <Plus className="h-4 w-4" />
        新建相册
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="relative w-full max-w-md rounded-2xl border border-white/15 bg-album-bg2 p-4 shadow-xl"
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute right-2 top-2 rounded-full p-1 text-album-warm/60 hover:bg-white/10"
        aria-label="关闭"
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="mb-3 font-zpix font-bold text-album-accent">新建相册</h3>
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="相册名称（必填）"
          className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-album-text outline-none placeholder:text-album-warm/40 focus:border-album-accent"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="描述（可选）"
          className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-album-text outline-none placeholder:text-album-warm/40 focus:border-album-accent"
        />
        <label className="block">
          <span className="mb-1 block text-xs text-album-warm/70">日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-album-text outline-none focus:border-album-accent"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        {message && (
          <p className={`flex items-center gap-1.5 text-xs ${message.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            <Sparkles className="h-3 w-3" />
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-album-accent px-4 py-1.5 text-sm font-bold text-white transition hover:bg-album-accentStrong disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          保存
        </button>
      </div>
    </form>
  )
}
