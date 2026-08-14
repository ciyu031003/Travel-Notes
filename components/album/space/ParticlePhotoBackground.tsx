'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Three.js 粒子化照片背景（留言页用）：
 * - 照片像素采样为细密粒子，散落 → 聚合为整张照片（uProgress 过渡）
 * - 粒子颜色 = 原始像素 RGB，亮度驱动大小；粒子更小 → 照片更清晰
 * - 径向边缘模糊：中心清晰，边缘粒子放大 + 变淡，形成柔和消融
 * - 双粒子层（主粒子 + Additive bloom），深空黑底 #050508
 * - 通过 onAspect 上报照片宽高比，父级据此决定窗口大小
 */

const VERTEX = /* glsl */ `
attribute vec2  aUv;
attribute float aRand;
attribute float aBright;
attribute float aEdge;

uniform float uTime;
uniform float uProgress;   // 0 散落 → 1 聚合为照片
uniform float uPixel;
uniform float uSize;
uniform float uBloom;
uniform vec2  uPhotoSize;  // 世界单位宽高（与画布同比例）
uniform sampler2D uPhoto;
uniform sampler2D uDot;

varying vec3 vColor;
varying float vAlpha;

void main(){
  // 聚合态：照片平面 + 随机厚度
  vec3 photo = vec3(
    (aUv.x - 0.5) * uPhotoSize.x,
    (aUv.y - 0.5) * uPhotoSize.y,
    (aRand - 0.5) * 1.4
  );

  // 散落态：随机球面
  float phi = aRand * 6.2831853;
  float th  = acos(1.0 - 2.0 * fract(aRand * 7.13));
  float R   = 1.8 + fract(aRand * 3.7) * 2.6;
  vec3 scatter = R * vec3(sin(th) * cos(phi), sin(th) * sin(phi), cos(th));

  float p = smoothstep(0.0, 1.0, uProgress);
  vec3 pos = mix(scatter, photo, p);

  // 呼吸漂移
  float breath = sin(uTime * 1.6 + aRand * 6.28) * 0.024;
  pos += photo * breath;

  // 径向边缘：中心清晰 → 边缘模糊（粒子向外微散 + 放大 + 变淡）
  vec2 cd = (aUv - 0.5) * 2.0;
  float edgeR = length(cd);
  float edgeSoft = smoothstep(0.6, 1.18, edgeR);
  pos += photo * edgeSoft * 0.028;

  // 颜色：照片像素 RGB
  vec2 uv = clamp(aUv, vec2(0.001), vec2(0.999));
  vec3 col = texture2D(uPhoto, uv).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vColor = col * (0.98 + 0.15 * lum);
  vAlpha = (0.92 + 0.08 * p) * mix(1.0, 0.1, edgeSoft);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float dist = max(0.5, -mv.z);
  // 细粒子：基础尺寸下调，边缘放大形成模糊感
  float base = (0.55 + lum * 1.9 + aBright * 0.5) * uSize * (1.0 + uBloom * 0.5);
  float sizeMul = 1.0 + edgeSoft * 0.85;
  gl_PointSize = clamp(base * sizeMul * uPixel * (150.0 / dist), uBloom > 0.5 ? 1.1 : 0.7, uBloom > 0.5 ? 7.0 : 4.5);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uDot;
uniform float uBloom;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec4 tex = texture2D(uDot, gl_PointCoord);
  if (tex.a < 0.02) discard;
  float a = tex.a;
  if (uBloom > 0.5) a = a * a;
  gl_FragColor = vec4(vColor * (uBloom > 0.5 ? 1.2 : 1.0), a * vAlpha * (uBloom > 0.5 ? 0.45 : 1.0));
}
`

function makeDotTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31)
  g.addColorStop(0, 'rgba(255,255,255,0.98)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.72, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(cv)
}

interface ParticlePhotoBackgroundProps {
  image: string
  className?: string
  /** 照片加载后上报宽高比（宽/高），父级据此决定窗口尺寸 */
  onAspect?: (aspect: number) => void
}

export default function ParticlePhotoBackground({ image, className = '', onAspect }: ParticlePhotoBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onAspectRef = useRef(onAspect)
  onAspectRef.current = onAspect

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    } catch {
      return
    }
    renderer.setClearColor(0x050508, 1)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50)
    camera.position.z = 6

    const sharedTime = { value: 0 }
    let geometry: THREE.BufferGeometry | null = null
    let points: THREE.Points | null = null
    let bloomPoints: THREE.Points | null = null
    let progress = 0
    let raf = 0
    let disposed = false
    let started = false

    const isMobile = window.innerWidth < 768 || matchMedia('(pointer: coarse)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2)
    const targetCount = isMobile ? 14000 : 36000

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth
      const h = canvas.clientHeight || window.innerHeight
      if (w < 2 || h < 2) return
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (disposed) return
      onAspectRef.current?.(img.width / img.height)
      // 采样画布
      const sampleW = 420
      const sampleH = Math.max(1, Math.min(560, Math.round(sampleW * (img.height / img.width))))
      const area = sampleW * sampleH
      const step = Math.max(1, Math.ceil(Math.sqrt(area / targetCount)))
      const off = document.createElement('canvas')
      off.width = sampleW
      off.height = sampleH
      const octx = off.getContext('2d')
      if (!octx) return
      octx.drawImage(img, 0, 0, sampleW, sampleH)
      const data = octx.getImageData(0, 0, sampleW, sampleH).data

      const cols = Math.ceil(sampleW / step)
      const rows = Math.ceil(sampleH / step)
      const count = cols * rows
      const positions = new Float32Array(count * 3)
      const uvs = new Float32Array(count * 2)
      const rands = new Float32Array(count)
      const brights = new Float32Array(count)
      const edges = new Float32Array(count)

      let i = 0
      for (let y = 0; y < sampleH && i < count; y += step) {
        for (let x = 0; x < sampleW && i < count; x += step) {
          const idx = (y * sampleW + x) * 4
          const a = data[idx + 3]
          if (a < 40) continue
          uvs[i * 2] = (x + 0.5) / sampleW
          uvs[i * 2 + 1] = 1 - (y + 0.5) / sampleH
          rands[i] = Math.random()
          const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255
          brights[i] = lum
          const edgeX = x < sampleW * 0.05 || x > sampleW * 0.95
          const edgeY = y < sampleH * 0.05 || y > sampleH * 0.95
          edges[i] = edgeX || edgeY ? 1 : 0
          i++
        }
      }

      geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, i * 3), 3))
      geometry.setAttribute('aUv', new THREE.BufferAttribute(uvs.slice(0, i * 2), 2))
      geometry.setAttribute('aRand', new THREE.BufferAttribute(rands.slice(0, i), 1))
      geometry.setAttribute('aBright', new THREE.BufferAttribute(brights.slice(0, i), 1))
      geometry.setAttribute('aEdge', new THREE.BufferAttribute(edges.slice(0, i), 1))

      const texture = new THREE.Texture(img)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.needsUpdate = true
      const dot = makeDotTexture()

      // 照片与世界画布同比例（窗口按照片比例布局，无需裁剪）
      const w = canvas.clientWidth || window.innerWidth
      const h = canvas.clientHeight || window.innerHeight
      const canvasAspect = w / h
      const viewH = 2 * 6 * Math.tan((50 * Math.PI) / 360) * 1.06
      const photoSize = new THREE.Vector2(viewH * canvasAspect, viewH)

      const uniforms = {
        uTime: sharedTime,
        uProgress: { value: 0 },
        uPixel: { value: dpr },
        uSize: { value: 1 },
        uBloom: { value: 0 },
        uPhotoSize: { value: photoSize },
        uPhoto: { value: texture },
        uDot: { value: dot },
      }
      const bloomUniforms = { ...uniforms, uBloom: { value: 1 }, uSize: { value: 1.45 } }

      const makeMaterial = (uni: typeof uniforms) =>
        new THREE.ShaderMaterial({
          uniforms: uni,
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: uni.uBloom.value > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending,
        })

      const material = makeMaterial(uniforms)
      const bloomMaterial = makeMaterial(bloomUniforms)
      points = new THREE.Points(geometry, material)
      points.renderOrder = 1
      points.frustumCulled = false
      bloomPoints = new THREE.Points(geometry, bloomMaterial)
      bloomPoints.renderOrder = 0
      bloomPoints.frustumCulled = false
      scene.add(bloomPoints)
      scene.add(points)

      started = true
      raf = requestAnimationFrame(tick)
    }
    img.onerror = () => {
      // 加载失败退化为纯色背景
    }
    img.src = image

    const tick = () => {
      if (disposed) return
      if (document.hidden) {
        raf = requestAnimationFrame(tick)
        return
      }
      const now = performance.now() / 1000
      const dt = Math.min(0.05, now - (lastNow || now))
      lastNow = now
      sharedTime.value += dt
      if (progress < 1) {
        progress = Math.min(1, progress + dt * 0.55)
        const p = 1 - Math.pow(1 - progress, 3)
        if (points) (points.material as THREE.ShaderMaterial).uniforms.uProgress.value = p
        if (bloomPoints) (bloomPoints.material as THREE.ShaderMaterial).uniforms.uProgress.value = p
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    let lastNow = 0

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && started && !disposed) {
        lastNow = 0
        raf = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      ro.disconnect()
      geometry?.dispose()
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat) mat.dispose()
      })
      renderer.dispose()
    }
  }, [image])

  return <canvas ref={canvasRef} className={className || 'absolute inset-0 w-full h-full'} aria-hidden="true" />
}
