'use client'

import { useEffect, useRef } from 'react'

/**
 * 深邃动态星空背景（canvas）
 * - 缓慢流动的星云光晕 + 闪烁星光 + 偶尔划过流星
 * - 性能友好：粒子数受限、DPR 上限 1.5、页面隐藏时暂停
 */
interface Star {
  x: number
  y: number
  r: number
  baseAlpha: number
  phase: number
  speed: number
  drift: number
}

interface Nebula {
  x: number
  y: number
  r: number
  hue: number
  alpha: number
  speedX: number
  speedY: number
  phase: number
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  active: boolean
}

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let raf = 0
    let stars: Star[] = []
    let nebulas: Nebula[] = []
    const meteor: Meteor = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, active: false }
    let meteorTimer = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      width = rect?.width || window.innerWidth
      height = rect?.height || window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initStars()
    }

    const initStars = () => {
      const count = Math.min(220, Math.floor((width * height) / 9000))
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.4 + Math.random() * 1.3,
        baseAlpha: 0.2 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
        drift: 0.02 + Math.random() * 0.06,
      }))

      const nebulaDefs = [
        { hue: 260, alpha: 0.10, r: 0.42 },
        { hue: 210, alpha: 0.09, r: 0.36 },
        { hue: 330, alpha: 0.08, r: 0.30 },
        { hue: 190, alpha: 0.07, r: 0.26 },
      ]
      nebulas = nebulaDefs.map((n) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.max(width, height) * n.r,
        hue: n.hue,
        alpha: n.alpha,
        speedX: (Math.random() * 0.006 + 0.002) * (Math.random() > 0.5 ? 1 : -1),
        speedY: (Math.random() * 0.005 + 0.002) * (Math.random() > 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
      }))
    }

    const drawNebulas = (t: number) => {
      for (const n of nebulas) {
        const nx = n.x + Math.sin(t * n.speedX + n.phase) * 60
        const ny = n.y + Math.cos(t * n.speedY + n.phase) * 40
        const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.r)
        grad.addColorStop(0, `hsla(${n.hue}, 80%, 60%, ${n.alpha})`)
        grad.addColorStop(0.5, `hsla(${n.hue + 20}, 70%, 50%, ${n.alpha * 0.5})`)
        grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)
      }
    }

    const drawStars = (t: number) => {
      for (const s of stars) {
        const twinkle = Math.sin(t * s.speed + s.phase) * 0.5 + 0.5
        const alpha = s.baseAlpha * (0.4 + twinkle * 0.6)
        ctx.beginPath()
        ctx.arc(s.x + Math.sin(t * s.drift + s.phase) * 8, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.fill()
      }
    }

    const drawMeteor = (t: number) => {
      meteorTimer += 1
      if (!meteor.active && meteorTimer > 400 + Math.random() * 600) {
        meteor.active = true
        meteorTimer = 0
        const fromRight = Math.random() > 0.5
        const angle = (Math.PI / 5) * (fromRight ? 1 : -1)
        meteor.x = fromRight ? width + 60 : -60
        meteor.y = Math.random() * height * 0.4
        meteor.vx = Math.cos(angle) * (fromRight ? -6 : 6)
        meteor.vy = Math.sin(angle) * 6
        meteor.life = 0
        meteor.maxLife = 70 + Math.random() * 40
      }
      if (meteor.active) {
        meteor.life++
        meteor.x += meteor.vx
        meteor.y += meteor.vy
        const fade = 1 - meteor.life / meteor.maxLife
        if (fade <= 0 || meteor.x < -80 || meteor.x > width + 80) {
          meteor.active = false
          return
        }
        const tailLen = 90
        const grad = ctx.createLinearGradient(
          meteor.x, meteor.y,
          meteor.x - meteor.vx * (tailLen / Math.hypot(meteor.vx, meteor.vy)),
          meteor.y - meteor.vy * (tailLen / Math.hypot(meteor.vx, meteor.vy))
        )
        grad.addColorStop(0, `rgba(255,255,255,${0.8 * fade})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(meteor.x, meteor.y)
        ctx.lineTo(
          meteor.x - meteor.vx * (tailLen / Math.hypot(meteor.vx, meteor.vy)),
          meteor.y - meteor.vy * (tailLen / Math.hypot(meteor.vx, meteor.vy))
        )
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(meteor.x, meteor.y, 1.4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${fade})`
        ctx.fill()
      }
      void t
    }

    const render = (time: number) => {
      const t = time / 1000
      ctx.clearRect(0, 0, width, height)
      // 深空底色
      const bg = ctx.createLinearGradient(0, 0, width, height)
      bg.addColorStop(0, '#05060f')
      bg.addColorStop(0.5, '#0a0d1f')
      bg.addColorStop(1, '#070a18')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)
      drawNebulas(t)
      drawStars(t)
      drawMeteor(t)
      raf = requestAnimationFrame(render)
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(render)
    }

    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
}
