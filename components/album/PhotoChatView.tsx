'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { ArrowLeft, Send, Moon, Loader2, MessageCircle, Sparkles } from 'lucide-react'
import ParticlePhotoBackground from './space/ParticlePhotoBackground'
import StarfieldBackground from './StarfieldBackground'

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
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 照片留言视图（粒子化照片即窗口）：
 * - 页面不占全屏：粒子化照片按原图比例居中显示，照片有多大留言窗口就有多大
 * - 留言内容（顶部栏 / 气泡 / 输入框）直接叠加在粒子化照片之上
 * - 粒子背景中心清晰、边缘模糊（着色器径向衰减 + CSS 径向遮罩）
 * - 窗外为深空星空环境，每张照片独立会话（imageKey 隔离）
 */
export default function PhotoChatView({ image, imageKey, cityName, onBack }: PhotoChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [aspect, setAspect] = useState(4 / 3)
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
    <div className="fixed inset-0 z-[110] overflow-hidden bg-[#050508] flex items-center justify-center p-3 sm:p-6">
      {/* 窗外环境：深空星空 */}
      <div className="absolute inset-0 opacity-60 pointer-events-none" aria-hidden="true">
        <StarfieldBackground />
      </div>

      {/* 粒子化照片容器：照片有多大，留言窗口就多大 */}
      <div
        className="relative rounded-3xl overflow-hidden border border-white/10 shadow-[0_24px_90px_rgba(0,0,0,0.65)]"
        style={{
          width: `min(94vw, calc(84vh * ${aspect}))`,
          aspectRatio: String(aspect),
          maxHeight: '84vh',
        }}
      >
        {/* 粒子化照片背景（中心清晰 → 边缘模糊） */}
        <div className="absolute inset-0">
          <ParticlePhotoBackground
            image={image}
            onAspect={setAspect}
            className="absolute inset-0 w-full h-full chat-particle-mask"
          />
        </div>
        {/* 顶部/底部轻微压暗，保证文字可读（主体粒子保持明亮） */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55 pointer-events-none" />

        {/* 顶部栏：返回 + 照片信息 */}
        <header className="absolute top-0 inset-x-0 z-10 flex items-center gap-2.5 px-3 py-2.5 bg-black/25 backdrop-blur-md border-b border-white/10">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 text-xs border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回
          </button>
          <div className="relative w-9 h-9 rounded-full overflow-hidden border border-white/15 flex-shrink-0 shadow-md">
            <Image src={image} alt={cityName || '照片'} fill sizes="36px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-white/95 text-sm font-semibold truncate">
              {cityName ? `${cityName} · 星河留言` : '星河留言'}
            </h2>
            <p className="text-white/45 text-[10px] mt-0.5 flex items-center gap-1 truncate">
              <Sparkles className="w-3 h-3 text-amber-200/70 shrink-0" />
              留言仅绑定当前照片
            </p>
          </div>
        </header>

        {/* 聊天消息区（叠加在粒子照片上） */}
        <div
          ref={listRef}
          className="absolute z-10 top-[54px] bottom-[58px] inset-x-0 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin"
        >
          <div className="flex justify-center">
            <span className="text-[10px] text-white/50 bg-white/10 backdrop-blur-md rounded-lg px-2.5 py-1">
              这张照片在星河中等候你的留言 ✨
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center pt-10">
              <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-12 text-white/40 gap-2">
              <MessageCircle className="w-9 h-9 opacity-40" />
              <p className="text-[11px]">还没有留言，发送第一条吧</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex justify-end gap-2">
                <div className="max-w-[80%]">
                  <div className="flex justify-end mb-0.5">
                    <span className="text-[9px] text-white/40 drop-shadow">{formatTime(msg.createdAt)}</span>
                  </div>
                  <div className="relative bg-[#95ec69] text-[#1a1a1a] text-sm leading-relaxed px-3 py-1.5 rounded-2xl rounded-tr-sm break-words whitespace-pre-wrap shadow-md shadow-black/20">
                    {msg.content}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-lg mt-4">
                  <Moon className="w-4 h-4 text-white" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部输入区（叠加在粒子照片上） */}
        <div className="absolute z-10 bottom-0 inset-x-0 bg-black/30 backdrop-blur-xl border-t border-white/10 px-3 pt-2 pb-2.5">
          {error && <p className="text-[11px] text-red-400/90 mb-1 px-1">{error}</p>}
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
              className="flex-1 resize-none bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 placeholder-white/35 focus:outline-none focus:border-emerald-300/40 focus:bg-white/15 transition-colors max-h-24"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#95ec69] text-[#1a1a1a] text-sm font-medium hover:bg-[#a8f37c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              发送
            </button>
          </div>
          <p className="text-[9px] text-white/30 mt-1 text-center">
            Enter 发送 · Shift+Enter 换行 · 留言仅与当前照片绑定
          </p>
        </div>
      </div>
    </div>
  )
}
