'use client'

import { useState } from 'react'
import { Send, Loader2, Sparkles, Feather } from 'lucide-react'
import { createMoment } from '@/lib/modules/offline/moment-write'

/**
 * 碎碎念发布器：离线时本地乐观写 + 入同步队列（联网自动上传云端），在线直接发布。
 */
export default function MomentComposer({ onCreated }: { onCreated?: () => void }) {
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setMessage(null)
    const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean)
    const r = await createMoment(content.trim(), tagArr.length > 0 ? tagArr : null)
    if (r.ok) {
      setContent('')
      setTags('')
      setMessage({ type: 'ok', text: r.local ? '已保存到本地，联网后自动上传' : '发布成功' })
      onCreated?.()
    } else {
      setMessage({ type: 'err', text: r.error || '发布失败' })
    }
    setSubmitting(false)
  }

  return (
    <form
      onSubmit={submit}
      className="mb-8 rounded-[28px] border border-travel-sakura/50 bg-white/80 p-5 shadow-[0_16px_40px_-24px_rgba(168,95,58,0.45)] backdrop-blur-sm transition-colors focus-within:border-travel-bloom/70 focus-within:shadow-[0_18px_44px_-22px_rgba(168,95,58,0.5)] dark:border-travel-accent/20 dark:bg-shell-surface/70"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-travel-sakura to-travel-bloom text-white shadow-sm">
          <Feather className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-travel-inkStrong dark:text-shell-text">
          写下此刻
        </span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="记录此刻的想法、灵感或小确幸…"
        className="min-h-[76px] w-full resize-none rounded-2xl bg-travel-sakura/20 px-4 py-3 text-[15px] leading-7 text-travel-ink outline-none transition-colors placeholder:text-travel-sand/70 focus:bg-travel-sakura/30 dark:bg-travel-accent/10 dark:text-shell-text dark:placeholder:text-shell-faint dark:focus:bg-travel-accent/15"
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签（逗号分隔，可选）"
          className="min-w-0 flex-1 rounded-full border border-transparent bg-travel-sakura/30 px-4 py-2.5 text-xs text-travel-ink outline-none transition-colors placeholder:text-travel-sand/60 focus:border-travel-bloom/50 dark:bg-travel-accent/10 dark:text-shell-text dark:placeholder:text-shell-faint"
        />
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-travel-accent to-travel-accentStrong px-5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(168,95,58,0.6)] transition-all hover:shadow-[0_12px_28px_-10px_rgba(168,95,58,0.7)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          发布
        </button>
      </div>
      {message && (
        <p className={`mt-3 flex items-center gap-1.5 text-xs ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
          <Sparkles className="h-3 w-3" />
          {message.text}
        </p>
      )}
    </form>
  )
}
