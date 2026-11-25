'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import BrandLogo from "@/components/brand/BrandLogo"
import { MapPin } from "lucide-react"
import { Icon } from '@/components/mobile/Icon'
import dynamicImport from 'next/dynamic'
import { apiUrl } from '@/lib/api-base'

// 门面地图按需加载：把 china-geo 全量地理数据 + d3-geo 拆出登录页首屏 chunk
const DoorMap = dynamicImport(() => import('./DoorMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full" aria-hidden="true" />,
})

type Phase = 'closed' | 'opening' | 'open'

interface LoginDoorProps {
  children: ReactNode
}

// 封条只展示「月.日」，不展示年份（P1-14：公开端点不下发年份，避免推断关系起点）
function formatSealDate(month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(month)}.${pad(day)}`
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
    // 取最早公开纪念日的「月.日」作为封条日期（P1-14：不再拉取隐私的 /api/anniversaries 全量）
    let cancelled = false
    fetch(apiUrl('/api/anniversaries/seal'))
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        if (typeof json.month === 'number' && typeof json.day === 'number') {
          setSealDate(formatSealDate(json.month, json.day))
        }
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
    <div className="relative min-h-dvh overflow-hidden">
      {/* 动态背景（mp4）：延迟到门开始打开后才加载/播放，
          避免首屏即拉 2.9MB 视频（减轻登录首屏网络负担） */}
      {(phase === 'opening' || showContent) && (
        <video
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster="/videos/clover-poster.jpg"
          className="absolute inset-0 h-full w-full object-cover"
          src="/videos/clover.mp4"
        />
      )}
      {/*
        注意：这里曾经盖着两层**全屏**遮罩（180° 樱粉/白渐变 alpha 0.72–0.90 + 两团粉紫径向渐变），
        把 2.9MB 的四叶草原片糊成一片朦胧粉雾，用户明确要求「让 MP4 正常高清显示」。
        现在整屏遮罩全部删除 —— 视频原片直接可见。
        卡片可读性改由「局部」处理承担，绝不再覆盖整屏：
          · 桌面（≥1024）：app/login/web-login.css 把登录列包成一块暖象牙玻璃面板
            （rgba + backdrop-blur(20px)，只包住登录列本身，视频在两侧完整可见）；
          · 窄屏（<1024，Web 与 App 壳共用）：版式一个像素不动；视频比原粉色薄雾亮，
            只给直接压视频的两块**文字**加局部深色玻璃铭牌（页脚 + 头部「甜途」两行，
            见 app/login/web-login.css 的 .web-login-head-plate / .web-login-footer）——
            铭牌只包文字、不覆盖视频，P1-5 修复了亮帧上白字读不出来的问题。
        记住：不要再往这里加任何 absolute inset-0 的整屏渐变/暗角。
      */}

      {/* 登录内容 */}
      <div
        className={`relative z-10 ${popCard ? 'animate-[card-pop_0.65s_cubic-bezier(0.22,1,0.36,1)_both]' : ''} ${
          showContent ? '' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!showContent}
        inert={!showContent}
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
            className="absolute inset-y-0 left-0 w-1/2 origin-left overflow-hidden bg-[var(--m-bg-soft)] transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-[var(--m-bg-soft)] md:bg-travel-parchmentDim md:dark:bg-shell-surface"
            style={{ transform: phase === 'opening' ? 'rotateY(-108deg)' : 'rotateY(0deg)' }}
          >
            <div className="absolute left-0 top-0 h-full w-screen [--door-map-fill:rgba(231,111,145,0.10)] [--door-map-stroke:rgba(61,72,82,0.5)] dark:[--door-map-fill:rgba(240,138,170,0.14)] dark:[--door-map-stroke:rgba(232,230,225,0.45)]">
              <DoorMap className="h-full w-full" />
            </div>
            <div className="absolute left-6 top-6 flex items-center gap-2 md:left-10 md:top-10">
              <BrandLogo size={36} rounded="rounded-lg" />
              <span className="font-bold text-travel-ink dark:text-shell-text">甜途</span>
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
            className="absolute inset-y-0 right-0 w-1/2 origin-right overflow-hidden bg-[var(--m-bg-soft)] transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-[var(--m-bg-soft)] md:bg-travel-parchmentDim md:dark:bg-shell-surface"
            style={{
              transform: phase === 'opening' ? 'rotateY(108deg)' : 'rotateY(0deg)',
              transitionDelay: phase === 'opening' ? '70ms' : '0ms',
            }}
          >
            <div className="absolute right-0 top-0 h-full w-screen [--door-map-fill:rgba(231,111,145,0.10)] [--door-map-stroke:rgba(61,72,82,0.5)] dark:[--door-map-fill:rgba(240,138,170,0.14)] dark:[--door-map-stroke:rgba(232,230,225,0.45)]">
              <DoorMap className="h-full w-full" />
            </div>
            {/* 邮戳章 */}
            <div className="absolute bottom-8 right-8 flex h-24 w-24 rotate-6 items-center justify-center rounded-full border-2 border-dashed border-[var(--m-line-strong)] bg-white/40 md:border-travel-accentSoft dark:border-travel-bloom/70 dark:bg-shell-surface/60">
              <div className="text-center text-[var(--m-accent-strong)] dark:text-[var(--m-accent-strong)] md:text-travel-accentStrong">
                <Icon icon={MapPin} size="sm" className="mx-auto" />
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
            <div className="flex h-28 w-28 -rotate-6 items-center justify-center rounded-full border-2 border-dashed border-travel-accentSoft bg-travel-parchment shadow-[0_10px_30px_rgba(201,79,115,0.22)] dark:border-travel-bloom/70 dark:bg-shell-surface">
              <div className="text-center text-[var(--m-accent-strong)] dark:text-[var(--m-accent-strong)] md:text-travel-accentStrong">
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
