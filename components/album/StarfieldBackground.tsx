'use client'

import { useEffect, useRef } from 'react'

/**
 * 深邃宇宙星空背景（canvas）
 * - 大量细碎星光粒子，自由漂浮 + 缓慢旋转流动
 * - 远近三层深度：远层小而暗、中层、近层大而亮，层次感
 * - 星云光晕缓慢漂移 + 偶尔流星
 * - 性能友好：粒子数受限、DPR 上限 1.5、页面隐藏暂停
 */
interface StarParticle {
  // 轨道（缓慢旋转流动）
  cx: number
  cy: number
  radius: number
  angle: number
  angularSpeed: number
  // 自由漂浮偏移
  driftX: number
  driftY: number
  driftSpeed: number
  driftPhase: number
  // 外观
  size: number
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  layer: 0 | 1 | 2 // 0远 1中 2近
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
    let stars: StarParticle[] = []
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
      const count = Math.min(340, Math.floor((width * height) / 5200))
      stars = Array.from({ length: count }, () => {
        // 层次分配：远 55% / 中 30% / 近 15%
        const r = Math.random()
        const layer: 0 | 1 | 2 = r < 0.55 ? 0 : r < 0.85 ? 1 : 2
        const sizeBase = layer === 0 ? 0.35 : layer === 1 ? 0.7 : 1.2
        return {
          cx: Math.random() * width,
          cy: Math.random() * height,
          radius: Math.random() * Math.min(width, height) * 0.35,
          angle: Math.random() * Math.PI * 2,
          // 层次越近旋转越快，方向随机
          angularSpeed: (0.008 + Math.random() * 0.03) * (layer + 0.4) * (Math.random() > 0.5 ? 1 : -1),
          driftX: Math.random() * 30,
          driftY: Math.random() * 30,
          driftSpeed: 0.15 + Math.random() * 0.4,
          driftPhase: Math.random() * Math.PI * 2,
          size: sizeBase + Math.random() * (layer === 0 ? 0.3 : layer === 1 ? 0.6 : 1.1),
          baseAlpha: (layer === 0 ? 0.25 : layer === 1 ? 0.5 : 0.8) + Math.random() * 0.3,
          twinkleSpeed: 0.5 + Math.random() * 1.4,
          twinklePhase: Math.random() * Math.PI * 2,
          layer,
        }
      })

      const nebulaDefs = [
        { hue: 262, alpha: 0.11, r: 0.44 },
        { hue: 215, alpha: 0.10, r: 0.38 },
        { hue: 330, alpha: 0.09, r: 0.32 },
        { hue: 190, alpha: 0.08, r: 0.28 },
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
        const nx = n.x + Math.sin(t * n.speedX + n.phase) * 70
        const ny = n.y + Math.cos(t * n.speedY + n.phase) * 50
        const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.r)
        grad.addColorStop(0, `hsla(${n.hue}, 85%, 62%, ${n.alpha})`)
        grad.addColorStop(0.5, `hsla(${n.hue + 18}, 72%, 52%, ${n.alpha * 0.5})`)
        grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)
      }
    }

    const drawStars = (t: number) => {
      for (const s of stars) {
        // 旋转流动：绕轨道中心缓慢旋转
        const ang = s.angle + t * s.angularSpeed
        const ox = s.cx + Math.cos(ang) * s.radius
        const oy = s.cy + Math.sin(ang) * s.radius * 0.85
        // 自由漂浮：正弦漂移
        const px = ox + Math.sin(t * s.driftSpeed + s.driftPhase) * s.driftX
        const py = oy + Math.cos(t * s.driftSpeed * 1.3 + s.driftPhase) * s.driftY
        // 闪烁
        const twinkle = Math.sin(t * s.twinkleSpeed + s.twinklePhase) * 0.5 + 0.5
        const alpha = s.baseAlpha * (0.45 + twinkle * 0.55)

        // 近层粒子带轻微光晕
        if (s.layer === 2) {
          ctx.beginPath()
          ctx.arc(px, py, s.size * 2.4, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.12})`
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(px, py, s.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.fill()
      }
    }

    const drawMeteor = () => {
      meteorTimer += 1
      if (!meteor.active && meteorTimer > 500 + Math.random() * 700) {
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
        const hyp = Math.hypot(meteor.vx, meteor.vy)
        const tail = 90
        const grad = ctx.createLinearGradient(
          meteor.x, meteor.y,
          meteor.x - meteor.vx * (tail / hyp),
          meteor.y - meteor.vy * (tail / hyp)
        )
        grad.addColorStop(0, `rgba(255,255,255,${0.8 * fade})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(meteor.x, meteor.y)
        ctx.lineTo(
          meteor.x - meteor.vx * (tail / hyp),
          meteor.y - meteor.vy * (tail / hyp)
        )
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(meteor.x, meteor.y, 1.4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${fade})`
        ctx.fill()
      }
    }

    const render = (time: number) => {
      const t = time / 1000
      ctx.clearRect(0, 0, width, height)
      const bg = ctx.createLinearGradient(0, 0, width, height)
      bg.addColorStop(0, '#04050d')
      bg.addColorStop(0.5, '#090c1e')
      bg.addColorStop(1, '#060919')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)
      drawNebulas(t)
      drawStars(t)
      drawMeteor()
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
