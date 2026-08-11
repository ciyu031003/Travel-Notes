'use client'

import { useEffect, useRef, useState } from 'react'

interface Particle {
  sx: number; sy: number
  tx: number; ty: number
  color: string
  size: number
  delay: number
  duration: number
  driftX: number; driftY: number
  edge: boolean
  baseAlpha: number
  fadeDelay: number
}

/**
 * 粒子化图片背景：将原图打散成粒子颗粒并汇聚成型；
 * 画面四周边缘的粒子随时间慢慢消融消散，形成模糊渐隐效果。
 */
export default function ParticleImageBg({ image, className = '' }: { image: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imgEl] = useState<HTMLImageElement | null>(null)
  void imgEl

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let particles: Particle[] = []
    const startTime = performance.now()
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const setup = (w: number, h: number) => {
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = image
    img.onload = () => {
      // 采样画布：限制尺寸控制粒子数量
      const maxW = 280
      const scale = Math.min(1, maxW / img.width)
      const sw = Math.round(img.width * scale)
      const sh = Math.round(img.height * scale)
      const off = document.createElement('canvas')
      off.width = sw
      off.height = sh
      const octx = off.getContext('2d')
      if (!octx) return
      octx.drawImage(img, 0, 0, sw, sh)
      const data = octx.getImageData(0, 0, sw, sh).data

      const rect = canvas.parentElement?.getBoundingClientRect()
      const dw = rect?.width || 600
      const dh = rect?.height || 500
      setup(dw, dh)

      // 展示尺寸（保持比例，铺满画布）
      const dispScale = Math.max(dw / sw, dh / sh)
      const drawW = sw * dispScale
      const drawH = sh * dispScale
      const offX = (dw - drawW) / 2
      const offY = (dh - drawH) / 2

      const step = 3 // 每 step 个像素采样一个粒子
      const maxParticles = 3600
      const list: Particle[] = []
      const edgeMargin = Math.min(sw, sh) * 0.10

      for (let y = 0; y < sh; y += step) {
        for (let x = 0; x < sw; x += step) {
          if (list.length >= maxParticles) break
          const idx = (y * sw + x) * 4
          const a = data[idx + 3]
          if (a < 40) continue
          const edge = x < edgeMargin || y < edgeMargin || x > sw - edgeMargin || y > sh - edgeMargin
          const tx = offX + x * dispScale
          const ty = offY + y * dispScale
          // 起始位置：从四周外随机散落，营造“打散”入场
          const fromAngle = Math.random() * Math.PI * 2
          const fromDist = Math.max(dw, dh) * (0.35 + Math.random() * 0.65)
          list.push({
            sx: tx + Math.cos(fromAngle) * fromDist,
            sy: ty + Math.sin(fromAngle) * fromDist,
            tx, ty,
            color: `rgba(${data[idx]}, ${data[idx + 1]}, ${data[idx + 2]}, `,
            size: 1 + Math.random() * 1.6,
            delay: Math.random() * 900,
            duration: 1400 + Math.random() * 1200,
            driftX: (Math.random() - 0.5) * 0.35,
            driftY: (Math.random() - 0.5) * 0.35,
            edge,
            baseAlpha: 0.55 + Math.random() * 0.45,
            fadeDelay: 1200 + Math.random() * 1800,
          })
        }
      }
      particles = list
    }

    const render = (now: number) => {
      const t = now - startTime
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      for (const p of particles) {
        const prog = Math.min(1, Math.max(0, (t - p.delay) / p.duration))
        const ease = 1 - Math.pow(1 - prog, 3)
        const x = p.sx + (p.tx - p.sx) * ease + Math.sin(now / 1000 + p.tx * 0.01) * p.driftX * 4
        const y = p.sy + (p.ty - p.sy) * ease + Math.cos(now / 1000 + p.ty * 0.01) * p.driftY * 4

        // 边缘粒子随时间消融消散
        let alpha = p.baseAlpha
        if (p.edge && t > p.fadeDelay) {
          alpha *= Math.max(0, 1 - (t - p.fadeDelay) / 2600)
        } else if (p.edge) {
          alpha *= 0.75
        }
        if (alpha <= 0.01) continue

        ctx.fillStyle = p.color + alpha.toFixed(3) + ')'
        ctx.fillRect(x, y, p.size, p.size)
      }
      raf = requestAnimationFrame(render)
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(render)
    }
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [image])

  return <canvas ref={canvasRef} className={className || 'absolute inset-0 w-full h-full'} aria-hidden="true" />
}
