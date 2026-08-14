'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Send, Moon, Loader2, MessageCircle, Sparkles } from 'lucide-react'
import ParticlePhotoBackground from './space/ParticlePhotoBackground'

interface Message {
  id: number
  imageKey: string
  content: string
  createdAt: string
}

interface PhotoChatViewProps {
  image: string
  imageKey: string
  cityName?: string
  onBack: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 照片留言整页视图：
 * - 页面背景 = 当前照片的粒子化效果（整页铺满，边缘粒子消融）
 * - 微信样式聊天 UI 直接叠加在粒子背景上层（非弹窗容器）
 * - 每张照片独立会话（imageKey 隔离）
 */
export default function PhotoChatView({ image, imageKey, cityName, onBack }: PhotoChatViewProps) {
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

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // Esc 返回
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

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
    <div className="fixed inset-0 z-[110] overflow-hidden bg-[#04050d] flex flex-col">
      {/* 整页粒子化照片背景（Three.js：散落 → 聚合为照片，清晰可见） */}
      <div className="absolute inset-0">
        <ParticlePhotoBackground image={image} />
      </div>
      {/* 仅顶部/底部轻微渐变保证文字可读性，主体照片粒子保持明亮 */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40 pointer-events-none" />

      {/* 顶部栏：返回 + 照片信息 */}
      <header className="relative z-10 flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-white/10 bg-black/20 backdrop-blur-md flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 text-sm border border-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回星河
        </button>
        <div className="relative w-11 h-11 rounded-full overflow-hidden border border-white/15 flex-shrink-0 shadow-lg">
          <img src={image} alt={cityName || '照片'} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-white/95 text-sm sm:text-base font-semibold truncate">
            {cityName ? `${cityName} · 星河留言` : '星河留言'}
          </h2>
          <p className="text-white/45 text-[11px] mt-0.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-200/70" />
            留言仅绑定当前照片，与其它照片完全隔离
          </p>
        </div>
      </header>

      {/* 聊天消息区（微信气泡，直接叠加在粒子背景上层） */}
      <div
        ref={listRef}
        className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3 scrollbar-thin"
      >
        <div className="flex justify-center">
          <span className="text-[11px] text-white/45 bg-white/10 backdrop-blur-md rounded-lg px-2.5 py-1">
            这张照片在星河中等候你的留言 ✨
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center pt-12">
            <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-white/35 gap-2">
            <MessageCircle className="w-10 h-10 opacity-40" />
            <p className="text-xs">还没有留言，发送第一条吧</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex justify-end gap-2">
              <div className="max-w-[78%]">
                <div className="flex justify-end mb-1">
                  <span className="text-[10px] text-white/35">{formatTime(msg.createdAt)}</span>
                </div>
                <div className="relative bg-[#95ec69] text-[#1a1a1a] text-sm leading-relaxed px-3.5 py-2 rounded-2xl rounded-tr-sm break-words whitespace-pre-wrap shadow-md shadow-black/20">
                  {msg.content}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-lg mt-5">
                <Moon className="w-4 h-4 text-white" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部输入区（微信风格） */}
      <div className="relative z-10 px-3 pt-2.5 pb-4 sm:pb-6 bg-black/35 backdrop-blur-xl border-t border-white/10 flex-shrink-0">
        {error && (
          <p className="text-[11px] text-red-400/90 mb-1.5 px-1">{error}</p>
        )}
        <div className="max-w-3xl mx-auto flex items-end gap-2">
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
            className="flex-1 resize-none bg-white/10 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white/90 placeholder-white/35 focus:outline-none focus:border-emerald-300/40 focus:bg-white/15 transition-colors max-h-28"
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
        <p className="text-[10px] text-white/30 mt-1.5 px-1 text-center">
          Enter 发送 · Shift+Enter 换行 · 留言仅与当前照片绑定
        </p>
      </div>
    </div>
  )
}
