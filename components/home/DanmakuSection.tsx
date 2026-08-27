'use client'

import { forwardRef, useEffect, useImperativeHandle, useState, type CSSProperties } from 'react'
import { Pause, Play, Send, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

export interface Danmaku {
  id: string
  text: string
  color: string
  timestamp: number
}

const danmakuColors = [
  '#D98E9E',
  '#C97E55',
  '#A85F3A',
  '#E4B478',
  '#B85A6D',
  '#D4A5B0',
]

export interface DanmakuSectionHandle {
  open: () => void
}

interface DanmakuSectionProps {}

/**
 * 首页留言/弹幕功能（UI-V3 P3 从 HomeClient 拆分）：
 * 弹幕数据 + 渲染层 + 暂停开关 + 留言输入弹窗（ui/Modal）自包含；
 * HomeClient 通过 ref.open() 唤起。
 */
export const DanmakuSection = forwardRef<DanmakuSectionHandle, DanmakuSectionProps>(function DanmakuSection(_props, ref) {
  const [showDanmakuInput, setShowDanmakuInput] = useState(false)
  const [danmakuText, setDanmakuText] = useState('')
  const [danmakus, setDanmakus] = useState<Danmaku[]>([])
  const [username, setUsername] = useState<string | null>(null)
  const [danmakuPaused, setDanmakuPaused] = useState(false)

  useImperativeHandle(ref, () => ({
    open: () => {
      setDanmakuText('')
      setShowDanmakuInput(true)
    },
  }))

  const closeDanmaku = () => {
    setShowDanmakuInput(false)
    setDanmakuText('')
  }

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/check-auth')
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated) setUsername(data.username)
        }
      } catch {}
    }
    checkAuth()
  }, [])

  useEffect(() => {
    const fetchDanmakus = async () => {
      try {
        const res = await fetch('/api/danmaku')
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.danmakus) {
            setDanmakus(data.data.danmakus)
          }
        }
      } catch {}
    }
    fetchDanmakus()
  }, [])

  const addDanmaku = async () => {
    if (!danmakuText.trim()) return
    const color = danmakuColors[Math.floor(Math.random() * danmakuColors.length)]
    try {
      const res = await fetch('/api/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: danmakuText.trim(), color }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.danmaku) {
          setDanmakus((prev) => [data.data.danmaku, ...prev])
        }
      }
    } catch {}
    closeDanmaku()
  }

  const removeDanmaku = async (id: string) => {
    try {
      const res = await fetch(`/api/danmaku?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDanmakus((prev) => prev.filter((d) => d.id !== id))
      }
    } catch {}
  }

  return (
    <>
      {/* 弹幕层 */}
      {!danmakuPaused && (
        <div aria-hidden="true" className="danmaku-layer fixed inset-0 z-30 pointer-events-none overflow-hidden">
          {danmakus.map((d, index) => (
            <DanmakuItem
              key={d.id}
              danmaku={d}
              topOffset={5 + (index % 8) * 11}
              duration={15 + (index % 5) * 3}
              delay={(index % 10) * 2.5}
            />
          ))}
        </div>
      )}

      {/* 弹幕暂停/开启开关 */}
      {danmakus.length > 0 && (
        <button
          type="button"
          onClick={() => setDanmakuPaused((v) => !v)}
          aria-pressed={danmakuPaused}
          className="fixed bottom-[76px] right-4 z-40 flex items-center gap-1.5 rounded-full border border-travel-line/70 dark:border-shell-line bg-white/95 dark:bg-shell-surface/95 px-3.5 py-2 text-xs font-medium text-travel-ink dark:text-shell-muted shadow-lg transition-colors hover:border-travel-bloom/70 hover:text-travel-accent md:bottom-6 md:right-6"
        >
          {danmakuPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          <span>{danmakuPaused ? '开启弹幕' : '暂停弹幕'}</span>
        </button>
      )}

      {/* 留言输入弹窗 */}
      <Modal open={showDanmakuInput} onClose={closeDanmaku} title="写一句留言">
        <p className="mb-4 text-sm text-travel-ink dark:text-shell-muted">
          写下此刻想说的话，它会飘动出现在首页
        </p>

        <textarea
          autoFocus
          value={danmakuText}
          onChange={(e) => setDanmakuText(e.target.value)}
          placeholder="在这里输入你的留言..."
          maxLength={50}
          className="h-24 w-full resize-none rounded-xl border border-travel-line dark:border-shell-line bg-travel-cream dark:bg-shell-surface2 p-3 text-travel-ink dark:text-shell-text transition-all placeholder-travel-sand/50 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/50"
        />
        <div className="mt-1 text-right text-xs text-travel-ink dark:text-shell-muted">{danmakuText.length}/50</div>

        <button
          onClick={addDanmaku}
          disabled={!danmakuText.trim()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-travel-accent py-3 font-semibold text-white transition-colors hover:bg-travel-accentStrong disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          <span>发送留言</span>
        </button>

        {danmakus.length > 0 && (
          <div className="mt-4 border-t border-travel-line/60 dark:border-shell-line pt-4">
            <p className="mb-2 text-xs text-travel-ink dark:text-shell-muted">历史留言 ({danmakus.length})</p>
            <div className="max-h-20 space-y-1.5 overflow-y-auto">
              {danmakus.slice(0, 3).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg bg-travel-cream dark:bg-shell-surface2 px-3 py-1.5 text-xs"
                >
                  <span className="truncate text-travel-ink dark:text-shell-text">{d.text}</span>
                  {username && (
                    <button
                      onClick={() => removeDanmaku(d.id)}
                      aria-label="删除这条留言"
                      className="ml-2 text-travel-sand/50 transition-colors hover:text-[#C44A5A]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
})

function DanmakuItem({
  danmaku,
  topOffset,
  duration,
  delay = 0,
}: {
  danmaku: Danmaku
  topOffset: number
  duration: number
  delay?: number
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), (delay + duration) * 1000)
    return () => clearTimeout(timer)
  }, [delay, duration])

  if (!visible) return null

  const style: CSSProperties = {
    top: `${topOffset}%`,
    left: '-100px',
    animation: `floatRight ${duration}s linear ${delay}s forwards`,
    zIndex: 30,
  }

  return (
    <div className="absolute text-sm font-medium whitespace-nowrap" style={style}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-travel-line/70 dark:border-shell-line bg-white/90 dark:bg-shell-surface/95 px-3 py-1 text-travel-ink dark:text-shell-muted shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: danmaku.color }} />
        {danmaku.text}
      </span>
    </div>
  )
}
