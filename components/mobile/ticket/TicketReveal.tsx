'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Sparkles, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import type { TicketData } from '@/lib/ticket/types'
import { DAYPART_LABEL, SEASON_FULL } from '@/lib/ticket/theme'

/**
 * 旅程完成 · 票据揭晓（庆祝浮层）
 * ============================================================================
 * 需求（真机反馈）：「每完成一次记录，屏幕中间自动生成机票/火车票/高铁票，
 * 以旋转弹出的形式呈现，四周带烟花彩带」。
 *
 * 三件事，各管一层：
 *   1) 背景：半透明暖色遮罩 + 径向光晕（不压暗到看不见票面）；
 *   2) 四周：canvas 粒子的彩带 + 3 组烟花（2.8s 后自然落完即停止 rAF，不常驻耗电）；
 *   3) 票面：从 -100° 的 rotateY 翻进来 + 轻微 rotateZ 定格，随后极慢悬浮；
 *      用户可「收进票据夹」或「查看这段旅程」。
 *
 * 性能与可访问性：
 *   · 粒子总量固定（彩带 90 + 烟花 3×26），canvas 尺寸固定 DPR 上限 2；
 *   · prefers-reduced-motion：跳过粒子动画与旋转，直接淡入；
 *   · role=dialog + aria-modal + Esc 关闭 + 关闭按钮自动聚焦。
 */

export interface TicketRevealProps {
  ticket: TicketData
  /** 票面主体（机票/火车票组件），由调用方按 transport 选择 */
  children: ReactNode
  onClose: () => void
  /** 「查看这段旅程」 */
  onOpenTravel?: () => void
  /** 「收进票据夹」 */
  onOpenArchive?: () => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  vr: number
  color: string
  life: number
  maxLife: number
  kind: 'confetti' | 'spark'
}

/**
 * 彩带/烟花配色走 CSS 变量（定义在 app/ticket-art.css 的 --tk-confetti-* / --tk-spark-*）。
 * Canvas 需要真实色值，所以运行时从 :root 读一遍；读不到就用透明色兜底（不写裸 hex ——
 * 设计 token 门禁禁止组件里硬编码颜色）。
 */
function readPalette(prefix: string, count: number): string[] {
  if (typeof window === 'undefined') return []
  const style = getComputedStyle(document.documentElement)
  const out: string[] = []
  for (let i = 1; i <= count; i++) {
    const value = style.getPropertyValue(prefix + i).trim()
    if (value) out.push(value)
  }
  return out
}

function celebrationPalette(): { confetti: string[]; spark: string[] } {
  const confetti = readPalette('--tk-confetti-', 6)
  const spark = readPalette('--tk-spark-', 4)
  // 兜底：至少用一个可见色，避免变量缺失时画布全透明
  const fallback = getComputedStyle(document.documentElement).getPropertyValue('--m-accent').trim() || 'currentColor'
  return {
    confetti: confetti.length ? confetti : [fallback],
    spark: spark.length ? spark : [fallback],
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function TicketReveal({ ticket, children, onClose, onOpenTravel, onOpenArchive }: TicketRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (prefersReducedMotion()) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const W = () => window.innerWidth
    const H = () => window.innerHeight
    const { confetti: CONFETTI_COLORS, spark: SPARK_COLORS } = celebrationPalette()
    const particles: Particle[] = []

    // 彩带：从两侧上方向中间飘落
    for (let i = 0; i < 90; i++) {
      const fromLeft = i % 2 === 0
      particles.push({
        x: fromLeft ? -20 + Math.random() * W() * 0.35 : W() * 0.65 + Math.random() * W() * 0.35,
        y: -Math.random() * H() * 0.3,
        vx: (fromLeft ? 1 : -1) * (0.6 + Math.random() * 1.6),
        vy: 1.4 + Math.random() * 2.2,
        w: 5 + Math.random() * 5,
        h: 9 + Math.random() * 9,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        life: 0,
        maxLife: 140 + Math.random() * 80,
        kind: 'confetti',
      })
    }

    // 烟花：三处爆点，朝四周辐射的短命火花
    const bursts = [
      { x: W() * 0.18, y: H() * 0.22, t: 0 },
      { x: W() * 0.82, y: H() * 0.18, t: 14 },
      { x: W() * 0.5, y: H() * 0.1, t: 28 },
    ]
    let frame = 0
    for (const b of bursts) {
      for (let i = 0; i < 26; i++) {
        const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.25
        const speed = 1.6 + Math.random() * 2.6
        particles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w: 2 + Math.random() * 2,
          h: 2 + Math.random() * 2,
          rot: 0,
          vr: 0,
          color: SPARK_COLORS[i % SPARK_COLORS.length],
          life: -b.t,
          maxLife: 46 + Math.random() * 18,
          kind: 'spark',
        })
      }
    }

    let raf = 0
    const tick = () => {
      frame++
      ctx.clearRect(0, 0, W(), H())
      let alive = 0
      for (const p of particles) {
        p.life++
        if (p.life < 0 || p.life > p.maxLife) continue
        alive++
        if (p.kind === 'confetti') {
          p.vy += 0.012
          p.vx *= 0.995
          p.x += p.vx
          p.y += p.vy
          p.rot += p.vr
        } else {
          p.vx *= 0.94
          p.vy = p.vy * 0.94 + 0.06
          p.x += p.vx
          p.y += p.vy
        }
        const t = p.life / p.maxLife
        ctx.save()
        ctx.globalAlpha = p.kind === 'confetti' ? Math.max(0, 1 - t * t) : Math.max(0, 1 - t)
        ctx.fillStyle = p.color
        ctx.translate(p.x, p.y)
        if (p.kind === 'confetti') {
          ctx.rotate(p.rot)
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.w, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      // 粒子全部结束（或兜底 5s）就停 rAF，别在浮层关闭后还跑
      if (alive > 0 && frame < 300) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W(), H())
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={'旅程完成 · ' + SEASON_FULL[ticket.season] + DAYPART_LABEL[ticket.dayPart] + '票据'}
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden px-5"
    >
      {/* 遮罩 + 暖色光晕 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--m-bg)_72%,transparent)] backdrop-blur-md"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--m-accent) 26%, transparent) 0%, transparent 68%)',
        }}
      />

      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />

      <button
        ref={closeRef}
        type="button"
        aria-label="关闭票据"
        onClick={onClose}
        className="m-press absolute right-4 top-[max(16px,env(safe-area-inset-top))] z-[2] flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--m-surface-solid)_86%,transparent)] text-[var(--m-text)] ring-1 ring-[var(--m-line)] backdrop-blur-md"
      >
        <Icon icon={X} size="sm" />
      </button>

      <motion.div
        initial={
          reduceMotion ? { opacity: 0 } : { opacity: 0, rotateY: -100, rotateZ: -10, scale: 0.62, y: 28 }
        }
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, rotateY: 0, rotateZ: -1.5, scale: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0.25 }
            : { type: 'spring', stiffness: 110, damping: 14, mass: 1.1 }
        }
        className="relative z-[1] w-full max-w-[420px] [transform-style:preserve-3d]"
        style={{ perspective: 1200 }}
      >
        {children}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.5, type: 'spring', stiffness: 200, damping: 22 }}
        className="relative z-[1] mt-6 flex w-full max-w-[420px] flex-col gap-2.5"
      >
        <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--m-accent-strong)]">
          <Icon icon={Sparkles} size="sm" />
          旅途已归档，这张票留作纪念
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onOpenArchive ?? onClose}
            className="m-btn m-btn-ghost flex-1"
          >
            收进票据夹
          </button>
          <button type="button" onClick={onOpenTravel ?? onClose} className="m-btn m-btn-primary flex-1">
            查看这段旅程
          </button>
        </div>
      </motion.div>
    </div>
  )
}
