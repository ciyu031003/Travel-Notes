'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Loader2, Clock, MessageCircle, ImageIcon, X, BookOpen } from 'lucide-react'
import PixelDeskBackground from './PixelDeskBackground'

interface Message {
  id: number
  imageKey: string
  content: string
  createdAt: string
}

interface PixelPhotoChatProps {
  image: string
  imageKey: string
  cityName?: string
  date?: string
  onBack: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayText(): string {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日${days[d.getDay()]}`
}

/**
 * 像素书卷聊天视图（SavePoint 风格）：
 * 打开一本羊皮纸书，左侧是照片 + 留言记录（横线纸上），右侧是留言面板。
 * 每张照片独立会话（imageKey 隔离），点击底片可预览大图。
 */
export default function PixelPhotoChat({ image, imageKey, cityName, date, onBack }: PixelPhotoChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
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
      // 忽略加载失败
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

  // Esc：先关大图，再返回相册
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewOpen) setPreviewOpen(false)
        else onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen, onBack])

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
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#0d0604]">
      {/* 像素木屋桌面背景 */}
      <PixelDeskBackground className="fixed inset-0" />

      {/* 顶部像素导航 */}
      <header className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 md:px-8 border-b-4 border-black bg-black/45">
        <button
          type="button"
          onClick={onBack}
          className="pixel-btn pixel-border-stone px-3 py-1.5 text-[11px] font-bold rounded-sm"
        >
          ← 返回相册
        </button>
        <div className="font-zpix text-[#dfa87a] text-sm font-bold tracking-widest drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)]">
          ✦ 旅行相册 · 存档 ✦
        </div>
        <div className="w-20 md:w-24" aria-hidden="true" />
      </header>

      {/* 书本容器 */}
      <div className="relative z-10 min-h-[calc(100vh-56px)] flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-[900px] pixel-book-container flex flex-col md:flex-row relative rounded-sm min-h-[560px]">
          {/* 金色书角 */}
          <div className="pixel-corner-gold-tl" />
          <div className="pixel-corner-gold-tr" />
          <div className="pixel-corner-gold-bl" />
          <div className="pixel-corner-gold-br" />
          {/* 中缝书脊 */}
          <div className="hidden md:block pixel-book-spine" />
          {/* 悬挂书签 */}
          <div className="bookmark-ribbon" />

          {/* 左页：照片 + 留言记录 */}
          <div className="w-full md:w-1/2 p-4 md:pr-8 border-b-4 md:border-b-0 md:border-r border-[#d8c9a6] relative">
            <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-[#d8c9a6]" />
            <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-[#d8c9a6]" />

            <div className="flex flex-col h-[520px]">
              {/* 头部：像素精灵 */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#a89f91]/35 select-none">
                <div className="flex items-center gap-2">
                  {/* 黄色像素机器人 */}
                  <div className="w-6 h-6 flex items-center justify-center bg-[#fce268] border border-black shadow-[1px_1px_0_#000] rounded-sm p-0.5">
                    <svg viewBox="0 0 16 16" className="w-full h-full text-black fill-current" xmlns="http://www.w3.org/2000/svg" style={{ imageRendering: 'pixelated' }}>
                      <rect x="7" y="0" width="2" height="2" />
                      <rect x="6" y="2" width="4" height="1" />
                      <rect x="1" y="6" width="1" height="4" />
                      <rect x="14" y="6" width="1" height="4" />
                      <rect x="4" y="7" width="2" height="2" />
                      <rect x="10" y="7" width="2" height="2" />
                      <rect x="5" y="11" width="6" height="1" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#1c1511]">照片守候精灵</span>
                    <span className="text-[9px] text-[#5b8731] flex items-center gap-1 leading-none font-bold">
                      <span className="w-1.5 h-1.5 bg-[#5b8731] rounded-full inline-block" />
                      在线 · 这张照片在等待你的留言
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onBack}
                  className="pixel-close-btn"
                  aria-label="关闭留言"
                  title="合上书本"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 拍立得照片条 */}
              <div className="flex items-center gap-3 pb-2 mb-2 select-none">
                <div
                  className="polaroid-frame w-20 shrink-0 cursor-pointer transition-transform hover:scale-105"
                  onClick={() => setPreviewOpen(true)}
                  title="点击预览大图"
                >
                  <img src={image} alt={cityName || '照片'} className="w-full aspect-square object-cover border border-black/70" />
                  <div className="pt-1 text-center">
                    <span className="text-[9px] text-[#5a3b30] font-bold truncate block">{cityName || '记忆'}</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-[#1c1511] truncate">{cityName || '旅行记忆'} · 留言簿</h2>
                  <p className="text-[10px] text-[#746759] mt-0.5 leading-relaxed">
                    点击左侧照片预览大图，
                    <br />
                    留言仅与当前照片绑定。
                  </p>
                </div>
              </div>

              {/* 聊天记录区（横线纸） */}
              <div
                ref={listRef}
                className="flex-grow overflow-y-auto mc-scrollbar pr-2 mb-2 pixel-paper-rules-chat rounded-sm border border-[#d8c9a6] p-2 space-y-3"
              >
                {loading ? (
                  <div className="flex items-center justify-center h-full py-10">
                    <Loader2 className="w-5 h-5 text-[#8a7662] animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-10">
                    <BookOpen className="w-10 h-8 text-[#8a7662] opacity-60" />
                    <p className="text-[10px] text-[#746759] font-bold leading-relaxed">
                      还没有留言，
                      <br />
                      写下第一句吧 ✍
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col w-full">
                      <div className="text-[9px] text-[#746759] mb-1 font-bold text-right select-none">
                        你 at {formatTime(msg.createdAt)}
                      </div>
                      <div className="p-2 max-w-[90%] border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.15)] text-xs leading-relaxed bg-[#70b237] text-black self-end whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 底部输入区 */}
              <div className="pt-2 border-t border-[#a89f91]/35">
                {error && (
                  <p className="text-[10px] text-[#a02a2a] font-bold mb-1.5">{error}</p>
                )}
                <div className="flex gap-1.5 w-full items-stretch h-9">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder="写下一句留言..."
                    maxLength={500}
                    disabled={sending}
                    className="flex-grow pixel-input min-w-0 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    className="pixel-btn pixel-border-green px-3 text-[11px] font-bold rounded-sm"
                    style={{ flexShrink: 0 }}
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    发送
                  </button>
                </div>
                <p className="text-[9px] text-[#8a7662] mt-1.5 text-center select-none">
                  Enter 发送 · 留言仅与当前照片绑定
                </p>
              </div>
            </div>

            {/* 页码 */}
            <div className="text-[10px] text-[#8a7662] text-center mt-2 font-bold select-none">第 1 页</div>
          </div>

          {/* 右页：留言面板 */}
          <div className="w-full md:w-1/2 p-4 md:pl-8 relative">
            <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-[#d8c9a6]" />
            <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-[#d8c9a6]" />

            <div className="flex flex-col h-[520px] justify-between">
              {/* 日期 */}
              <div className="flex justify-end items-center pb-2 border-b border-[#a89f91]/35 text-[#8a7662] text-[10px] font-bold select-none">
                <span className="flex items-center gap-1 text-[#8b5a2e]">
                  <Clock className="w-3.5 h-3.5" /> {todayText()}
                </span>
              </div>

              {/* 面板主体 */}
              <div className="flex-1 flex flex-col items-center justify-center px-4 text-center select-none">
                <div className="w-14 h-10 text-[#8a7662] mb-3 opacity-70">
                  <svg viewBox="0 0 24 24" className="w-full h-full fill-none stroke-current stroke-2" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 21V5a3 3 0 0 0-3-3H2v16h7a3 3 0 0 1 3 3Z" />
                    <path d="M12 21v-16a3 3 0 0 1 3-3h7v16h-7a3 3 0 0 0-3 3Z" />
                  </svg>
                </div>
                <h4 className="text-xs font-bold text-[#8b5a2e] mb-3 tracking-wider">—— 留言面板 ——</h4>

                {/* 照片底片 */}
                <div
                  className="photo-negative-container w-28 h-28 select-none cursor-pointer hover:brightness-110 hover:scale-105 active:scale-95 transition-all"
                  onClick={() => setPreviewOpen(true)}
                  title="点击预览大图"
                >
                  <div className="photo-negative-tag">寄照底片</div>
                  <img src={image} alt="记忆底片" className="w-full h-full object-cover" />
                </div>

                <p className="text-[10px] text-[#746759] mt-3 font-bold">
                  {messages.length > 0 ? `已收集 ${messages.length} 条留言` : '等待第一条留言'}
                </p>
                <p className="text-[9px] text-[#8a7662] mt-1.5 leading-relaxed max-w-[240px]">
                  点击左侧照片或底片可预览大图，也可以返回相册继续翻阅其它记忆。
                </p>
              </div>

              {/* 底部按钮 */}
              <div className="flex justify-between items-end pt-2 border-t border-[#a89f91]/35 gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="flex-1 mc-button mc-button-gold !py-1.5 text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <ImageIcon size={11} className="shrink-0" />
                  预览大图
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  className="flex-1 mc-button mc-button-parchment !py-1.5 text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <MessageCircle size={11} className="shrink-0" />
                  返回相册
                </button>
              </div>
            </div>

            {/* 页码 */}
            <div className="text-[10px] text-[#8a7662] text-center mt-2 font-bold select-none">第 2 页</div>
          </div>
        </div>
      </div>

      {/* 大图预览 */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="照片大图预览"
        >
          <button
            type="button"
            onClick={() => setPreviewOpen(false)}
            className="pixel-close-btn absolute top-4 right-4 z-10"
            aria-label="关闭预览"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="max-w-4xl w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={image}
              alt={`${cityName || '旅行记忆'} 大图预览`}
              className="w-full max-h-[85vh] object-contain border-4 border-black shadow-[8px_8px_0_rgba(0,0,0,0.6)]"
            />
            <p className="text-center text-[11px] text-[#a89f91] mt-3 font-bold select-none">
              点击任意处关闭 · Esc 关闭
            </p>
          </div>
        </div>
      )}
    </div>
  )
}