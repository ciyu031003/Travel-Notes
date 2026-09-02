'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import DoorMap from './DoorMap'

type Phase = 'closed' | 'opening' | 'open'

interface LoginDoorProps {
  children: ReactNode
}

function formatSealDate(date: string): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '启程'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

/**
 * 登录页开场：一扇"地图门"自动向内推开（每会话首次播放，可点击跳过），
 * 门后是 mp4 动态背景，随后登录卡片弹出。
 */
export default function LoginDoor({ children }: LoginDoorProps) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [instant, setInstant] = useState(false)
  const [sealDate, setSealDate] = useState('启程')
  const timers = useRef<number[]>([])

  const markSeen = () => {
    try {
      sessionStorage.setItem('login-door-seen', '1')
    } catch {}
  }

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)')
    let seen = false
    try {
      seen = sessionStorage.getItem('login-door-seen') === '1'
    } catch {}
    if (rm.matches || seen) {
      setInstant(true)
      setPhase('open')
      return
    }
    // 自动开门
    const t = window.setTimeout(() => {
      setPhase((p) => (p === 'closed' ? 'opening' : p))
    }, 700)
    timers.current.push(t)
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id))
      timers.current = []
    }
  }, [])

  useEffect(() => {
    if (phase !== 'opening') return
    const t = window.setTimeout(() => {
      setPhase('open')
      markSeen()
    }, 1600)
    timers.current.push(t)
    return () => window.clearTimeout(t)
  }, [phase])

  useEffect(() => {
    // 取最早的纪念日作为封条日期
    let cancelled = false
    fetch('/api/anniversaries')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.anniversaries?.length) return
        const dates = json.anniversaries
          .map((a: { date: string }) => new Date(a.date).getTime())
          .filter((t: number) => !Number.isNaN(t))
          .sort((a: number, b: number) => a - b)
        if (dates.length) setSealDate(formatSealDate(new Date(dates[0]).toISOString()))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const skip = () => {
    if (phase === 'closed') {
      setPhase('opening')
      const t = window.setTimeout(() => setPhase('open'), 500)
      timers.current.push(t)
    } else if (phase === 'opening') {
      setPhase('open')
    }
    markSeen()
  }

  const showContent = phase === 'open' || instant
  const popCard = phase === 'open' && !instant

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 动态背景（mp4） */}
      <video
        aria-hidden="true"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/clover.mp4"
      />
      {/* 可读性遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/45" />

      {/* 登录内容 */}
      <div
        className={`relative z-10 ${popCard ? 'animate-[card-pop_0.65s_cubic-bezier(0.22,1,0.36,1)_both]' : ''} ${
          showContent ? '' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!showContent}
      >
        {children}
      </div>

      {/* 地图门 */}
      {phase !== 'open' && (
        <div
          className="absolute inset-0 z-20"
          style={{ perspective: '1600px' }}
          onClick={skip}
          aria-hidden="true"
        >
          {/* 左扇门 */}
          <div
            className="absolute inset-y-0 left-0 w-1/2 origin-left overflow-hidden bg-travel-parchmentDim transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-shell-surface"
            style={{ transform: phase === 'opening' ? 'rotateY(-108deg)' : 'rotateY(0deg)' }}
          >
            <div className="absolute left-0 top-0 h-full w-screen [--door-map-fill:rgba(168,95,58,0.08)] [--door-map-stroke:rgba(61,72,82,0.5)] dark:[--door-map-fill:rgba(228,180,120,0.1)] dark:[--door-map-stroke:rgba(232,230,225,0.45)]">
              <DoorMap className="h-full w-full" />
            </div>
            <div className="absolute left-6 top-6 flex items-center gap-2 md:left-10 md:top-10">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-travel-accentSoft shadow-sm">
                <MapPin className="h-4 w-4 text-white" />
              </span>
              <span className="font-bold text-[#3D4852] dark:text-shell-text">行迹</span>
            </div>
            <div className="absolute bottom-8 left-8 hidden max-w-[240px] md:block">
              <p className="font-display text-2xl font-bold leading-snug text-[#2D3842] dark:text-shell-text">
                走过的
                <br />
                每一段旅程
              </p>
            </div>
          </div>

          {/* 右扇门 */}
          <div
            className="absolute inset-y-0 right-0 w-1/2 origin-right overflow-hidden bg-travel-parchmentDim transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-shell-surface"
            style={{
              transform: phase === 'opening' ? 'rotateY(108deg)' : 'rotateY(0deg)',
              transitionDelay: phase === 'opening' ? '70ms' : '0ms',
            }}
          >
            <div className="absolute right-0 top-0 h-full w-screen [--door-map-fill:rgba(168,95,58,0.08)] [--door-map-stroke:rgba(61,72,82,0.5)] dark:[--door-map-fill:rgba(228,180,120,0.1)] dark:[--door-map-stroke:rgba(232,230,225,0.45)]">
              <DoorMap className="h-full w-full" />
            </div>
            {/* 邮戳章 */}
            <div className="absolute bottom-8 right-8 flex h-24 w-24 rotate-6 items-center justify-center rounded-full border-2 border-dashed border-travel-accentSoft bg-white/40 dark:border-travel-bloom/70 dark:bg-shell-surface/60">
              <div className="text-center text-travel-accent dark:text-travel-bloom">
                <MapPin className="mx-auto h-4 w-4" />
                <p className="mt-0.5 text-[10px] tracking-widest">地图门</p>
              </div>
            </div>
          </div>

          {/* 封条 */}
          <div
            className={`absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
              phase === 'opening' ? 'scale-x-0 opacity-0' : 'scale-x-100 opacity-100'
            }`}
          >
            <div className="flex h-28 w-28 -rotate-6 items-center justify-center rounded-full border-2 border-dashed border-travel-accentSoft bg-travel-parchment shadow-[0_10px_30px_rgba(168,95,58,0.25)] dark:border-travel-bloom/70 dark:bg-shell-surface">
              <div className="text-center text-travel-accent dark:text-travel-bloom">
                <p className="text-[10px] tracking-[0.3em]">启程</p>
                <p className="mt-1 font-display text-base font-bold">{sealDate}</p>
              </div>
            </div>
          </div>

          {/* 门缝漏光 */}
          <div
            className="absolute inset-y-0 left-1/2 w-[55%] -translate-x-1/2 bg-gradient-to-r from-white/0 via-white/30 to-white/0 transition-opacity duration-700"
            style={{ opacity: phase === 'opening' ? 0.7 : 0 }}
          />

          {/* 提示 */}
          {phase === 'closed' && (
            <div className="absolute inset-x-0 bottom-10 z-10 text-center">
              <span className="rounded-full bg-black/30 px-4 py-1.5 text-sm text-white/90 backdrop-blur-sm">
                点击开门
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
