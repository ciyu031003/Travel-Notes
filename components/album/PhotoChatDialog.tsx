'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Send, Moon, Loader2, MessageCircle } from 'lucide-react'
import ParticleImageBg from './ParticleImageBg'

interface Message {
  id: number
  imageKey: string
  content: string
  createdAt: string
}

interface PhotoChatDialogProps {
  image: string
  imageKey: string
  cityName?: string
  onClose: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function PhotoChatDialog({ image, imageKey, cityName, onClose }: PhotoChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/photo-messages?image=${encodeURIComponent(imageKey)}`)
      if (res.ok) {
        const json = await res.json()
        setMessages(Array.isArray(json.data) ? json.data : [])
      }
    } catch {
      // 忽略
    } finally {
      setLoading(false)
    }
  }, [imageKey])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // 新消息自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // Esc 关闭 + 滚动锁定
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = original
    }
  }, [onClose])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/photo-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageKey, content }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '发送失败')
        return
      }
      setMessages((prev) => [...prev, json.data as Message])
      setInput('')
    } catch {
      setError('网络异常，请重试')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden bg-[#05060f]" role="dialog" aria-modal="true">
      {/* 粒子化图片背景（原图打散 + 边缘消融） */}
      <div className="absolute inset-0 opacity-45">
        <ParticleImageBg image={image} />
      </div>
      {/* 整体深色遮罩，突出聊天窗口 */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/75 pointer-events-none" />

      {/* 右上角关闭 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 backdrop-blur-md border border-white/15 transition-colors"
        aria-label="关闭"
      >
        <X className="w-5 h-5" />
      </button>

      {/* 聊天窗口（微信风格） */}
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 z-10 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md sm:max-w-lg h-[82vh] max-h-[720px] flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-[#0d1020]/92 backdrop-blur-xl">
          {/* 头部 */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#12162b]/95 border-b border-white/10 flex-shrink-0">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/15 flex-shrink-0">
              <img src={image} alt={cityName || '照片'} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-white/95 text-sm font-semibold truncate">
                {cityName ? `${cityName} · 星河留言` : '星河留言'}
              </h3>
              <p className="text-white/40 text-[11px] mt-0.5">
                每一张照片都有自己的故事，来聊聊这张吧
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors sm:hidden"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 消息区 */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin"
            style={{ background: 'rgba(10, 12, 26, 0.55)' }}
          >
            {/* 系统提示（微信群聊风格） */}
            <div className="flex justify-center">
              <span className="text-[11px] text-white/40 bg-white/8 rounded-md px-2 py-0.5">
                这张照片在星河中等候你的留言 ✨
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center pt-10">
                <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-14 text-white/35 gap-2">
                <MessageCircle className="w-9 h-9 opacity-40" />
                <p className="text-xs">还没有留言，发送第一条吧</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="flex justify-end gap-2">
                  <div className="max-w-[75%]">
                    <div className="flex justify-end mb-0.5">
                      <span className="text-[10px] text-white/30">{formatTime(msg.createdAt)}</span>
                    </div>
                    <div className="relative bg-[#95ec69] text-[#1a1a1a] text-sm leading-relaxed px-3.5 py-2 rounded-2xl rounded-tr-sm break-words whitespace-pre-wrap shadow-sm">
                      {msg.content}
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-md mt-4">
                    <Moon className="w-4 h-4 text-white" />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 输入区（微信风格） */}
          <div className="px-3 pt-2 pb-3 bg-[#0d1020]/95 border-t border-white/10 flex-shrink-0">
            {error && (
              <p className="text-[11px] text-red-400/90 mb-1.5 px-1">{error}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                rows={1}
                maxLength={500}
                placeholder="留下你的留言..."
                className="flex-1 resize-none bg-white/8 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-emerald-300/40 focus:bg-white/10 transition-colors max-h-28"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#95ec69] text-[#1a1a1a] text-sm font-medium hover:bg-[#a8f37c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                发送
              </button>
            </div>
            <p className="text-[10px] text-white/25 mt-1.5 px-1">Enter 发送 · Shift+Enter 换行 · 留言仅与该照片绑定</p>
          </div>
        </div>
      </div>
    </div>
  )
}
