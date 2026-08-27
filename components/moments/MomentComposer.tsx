'use client'

import { useState } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
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
    <form onSubmit={submit} className="mb-6 rounded-2xl bg-white/70 p-4 ring-1 ring-travel-sakura/40 dark:bg-shell-surface/60 dark:ring-travel-accent/15">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="记录此刻的想法、灵感或小确幸…"
        className="w-full resize-none rounded-xl bg-transparent px-1 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-sand/60 dark:text-shell-text"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签（逗号分隔，可选）"
          className="min-w-0 flex-1 rounded-full bg-travel-sakura/30 px-3 py-1.5 text-xs text-travel-ink outline-none placeholder:text-travel-sand/60 dark:bg-travel-accent/10 dark:text-shell-text"
        />
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-travel-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-travel-accentStrong disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          发布
        </button>
      </div>
      {message && (
        <p className={`mt-2 flex items-center gap-1.5 text-xs ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
          <Sparkles className="h-3 w-3" />
          {message.text}
        </p>
      )}
    </form>
  )
}
