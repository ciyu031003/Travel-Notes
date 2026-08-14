import * as THREE from 'three'
import type { CityData } from './particlePhoto'
import { buildPhotoAtlas } from './particlePhoto'
import { createNebulaSkybox, createStarField } from './galaxyBackground'
import { createVinylRecord, updateVinylRecordUniforms, type VinylRecord } from './vinylRecord'

export interface GalaxyEngineCallbacks {
  onSelect?: (index: number) => void
  onCloseup?: (close: boolean) => void
  onHover?: (index: number | null) => void
  onReady?: () => void
  onProgress?: (done: number, total: number) => void
}

const ORIGIN = new THREE.Vector3(0, 0, 0)
const RING_RADIUS = 15
const CLOSE_RADIUS = 4.8
const PANO_RADIUS = 0.6

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}

export class GalaxyAlbumEngine {
  private container: HTMLElement
  private callbacks: GalaxyEngineCallbacks
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private raycaster = new THREE.Raycaster()
  private sharedTime = { value: 0 }
  private records: VinylRecord[] = []
  private atlases: { dispose: () => void }[] = []
  private nebula: THREE.Mesh
  private stars: THREE.Points
  private raf = 0
  private disposed = false
  private started = false
  private resizeObs: ResizeObserver | null = null

  // 相机状态
  private yaw = 0
  private pitch = 0
  private radius = PANO_RADIUS
  private panoYaw = 0
  private panoPitch = 0
  private closeYaw = 0
  private closePitch = 0
  private closeMode = false
  private closeRadius = CLOSE_RADIUS
  private panoFov = 60
  private selectedIndex = 0
  private prevSelectedIndex = -1
  private switchingUntil = 0

  // 指针状态
  private pointer = new THREE.Vector2(0, 0)
  private pointerSeen = false
  private hoverIndex: number | null = null
  private dragging = false
  private downAt = { x: 0, y: 0, t: 0 }
  private lastPointer = { x: 0, y: 0 }
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0
  private lastPointerUpAt = 0
  private qualitySamples: number[] = []
  private qualityDecided = false
  private qualityLevel = 0

  constructor(container: HTMLElement, callbacks: GalaxyEngineCallbacks = {}) {
    this.container = container
    this.callbacks = callbacks

    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || matchMedia('(pointer: coarse)').matches)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x050508, 1)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2))
    const el = this.renderer.domElement
    el.style.display = 'block'
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.touchAction = 'none'
    container.appendChild(el)

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500)
    this.camera.position.set(0, 0, 0.6)

    this.nebula = createNebulaSkybox(this.sharedTime)
    this.scene.add(this.nebula)
    this.stars = createStarField(this.sharedTime)
    this.scene.add(this.stars)

    this.resize()
    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)

    this.bindEvents()
  }

  // ---------- 加载 ----------
  async load(cities: CityData[]) {
    const total = cities.length
    for (let i = 0; i < total; i++) {
      if (this.disposed) return
      this.callbacks.onProgress?.(i, total)
      const atlas = await buildPhotoAtlas(cities[i].images)
      if (!atlas || this.disposed) continue
      const record = createVinylRecord({
        index: i,
        count: total,
        radius: RING_RADIUS,
        city: cities[i],
        atlas,
        sharedTime: this.sharedTime,
      })
      this.records.push(record)
      this.scene.add(record.group)
      this.atlases.push({ dispose: () => atlas.texture.dispose() })
    }
    if (this.disposed) return
    if (this.records.length > 0) {
      // 加载完成直接对准第一张唱片（避免缓动窗口期点击脱靶）
      this.pointCameraAt(this.selectedIndex, true)
      this.callbacks.onSelect?.(this.selectedIndex)
    }
    // 预热一帧：在 loading 遮罩期间完成着色器编译，避免就绪后主线程卡顿吞掉点击
    this.updateCamera(0.016)
    this.renderer.render(this.scene, this.camera)
    this.callbacks.onProgress?.(total, total)
    this.callbacks.onReady?.()
    this.start()
  }

  // ---------- 对外控制 ----------
  selectCity(index: number, opts: { close?: boolean } = {}) {
    if (index < 0 || index >= this.records.length) return
    this.switchIndex(index)
    if (opts.close) this.enterCloseup()
  }

  stepCity(dir: 1 | -1) {
    if (this.records.length === 0) return
    const next = (this.selectedIndex + dir + this.records.length) % this.records.length
    this.selectCity(next, { close: false })
  }

  zoomBy(factor: number) {
    if (this.closeMode) {
      this.closeRadius = clamp(this.closeRadius * factor, 2.2, 10)
    } else {
      this.panoFov = clamp(this.panoFov * (factor < 1 ? 1.06 : 0.94), 38, 75)
    }
  }

  exitCloseup() {
    if (!this.closeMode) return
    this.panoYaw = this.yaw
    this.panoPitch = this.pitch
    this.closeMode = false
    this.callbacks.onCloseup?.(false)
  }

  isCloseup() {
    return this.closeMode
  }

  getYaw() {
    return this.yaw
  }

  getSelectedIndex() {
    return this.selectedIndex
  }

  // ---------- 内部：选中与相机 ----------
  private switchIndex(index: number) {
    if (index === this.selectedIndex) return
    this.prevSelectedIndex = this.selectedIndex
    this.selectedIndex = index
    this.switchingUntil = performance.now() + 900
    this.pointCameraAt(index, false)
    this.callbacks.onSelect?.(index)
  }

  private pointCameraAt(index: number, snap: boolean) {
    const rec = this.records[index]
    if (!rec) return
    const pos = rec.group.position
    const d = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
    // 相机站在唱片的反方向（-d），朝向圆心即可正对唱片
    const targetYaw = Math.atan2(-d.x, -d.z)
    const targetPitch = clamp(Math.asin(-d.y), -1.1, 1.1)
    if (snap) {
      this.panoYaw = targetYaw
      this.panoPitch = targetPitch
      this.yaw = targetYaw
      this.pitch = targetPitch
    } else {
      this.panoYaw = targetYaw
      this.panoPitch = targetPitch
    }
  }

  private enterCloseup() {
    const rec = this.records[this.selectedIndex]
    if (!rec) return
    const pos = rec.group.position
    const d = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
    this.closeYaw = Math.atan2(-d.x, -d.z)
    this.closePitch = clamp(Math.asin(-d.y), -1.1, 1.1)
    this.closeRadius = CLOSE_RADIUS
    this.closeMode = true
    this.callbacks.onCloseup?.(true)
  }

  // ---------- 渲染循环 ----------
  private start() {
    if (this.started || this.disposed) return
    this.started = true
    this.raf = requestAnimationFrame(this.tick)
  }

  private tick = () => {
    if (this.disposed) return
    if (document.hidden) {
      this.raf = requestAnimationFrame(this.tick)
      return
    }
    const rawDt = this.clockDelta()
    const dt = Math.min(0.05, rawDt)
    this.sharedTime.value += dt
    this.measureQuality(rawDt)


    this.updateRecords(dt)
    this.updateCamera(dt)
    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.tick)
  }

  private lastTime = 0
  private clockDelta() {
    const now = performance.now() / 1000
    const dt = this.lastTime ? now - this.lastTime : 0.016
    this.lastTime = now
    return dt
  }

  /**
   * 自适应画质：帧率过低时自动降级（关 bloom → 降渲染分辨率），
   * 保证低端设备/软件渲染下的流畅度与输入可靠性
   */
  private measureQuality(rawDt: number) {
    if (this.qualityDecided) return
    const ms = rawDt * 1000
    this.qualitySamples.push(ms)
    // 单帧巨慢立即升级，不等采样完成
    if (ms > 180 && this.qualityLevel < 2) this.applyQuality(2)
    if (this.qualitySamples.length < 6) return
    const avg = this.qualitySamples.reduce((s, x) => s + x, 0) / this.qualitySamples.length
    this.qualitySamples = []
    this.qualityDecided = true
    if (avg > 38) this.applyQuality(1)
    if (avg > 70) this.applyQuality(2)
    if (avg > 110) this.applyQuality(3)
  }

  private applyQuality(level: number) {
    this.qualityLevel = Math.max(this.qualityLevel, level)
    // 1: 关闭 bloom 粒子层
    if (this.qualityLevel >= 1) {
      for (const rec of this.records) rec.bloomPoints.visible = false
    }
    // 2: 降低星点亮度
    if (this.qualityLevel >= 2) {
      const mat = this.stars.material as THREE.ShaderMaterial
      mat.uniforms.uAlpha.value = 0.5
    }
    // 3: 降低渲染分辨率（canvas 由 CSS 拉伸）
    if (this.qualityLevel >= 3) {
      this.renderer.setPixelRatio(0.75)
      this.resize()
    }
    console.log('[GalaxyAlbum] adaptive quality level', this.qualityLevel)
  }

  private updateRecords(dt: number) {
    const now = performance.now()
    const isClose = this.closeMode
    for (let i = 0; i < this.records.length; i++) {
      const rec = this.records[i]
      // 目标状态
      let progressTarget = 0.35
      let opacityTarget = 0.42
      if (i === this.selectedIndex) {
        progressTarget = 1
        opacityTarget = 1
      } else if (i === this.prevSelectedIndex && now < this.switchingUntil) {
        progressTarget = 0.15
        opacityTarget = 0.3
      } else if (isClose) {
        opacityTarget = 0.2
      }
      const hoverTarget = i === this.hoverIndex ? 1 : 0

      rec.progress = damp(rec.progress, progressTarget, 3.2, dt)
      rec.hover = damp(rec.hover, hoverTarget, 6, dt)
      rec.opacity = damp(rec.opacity, opacityTarget, 3.2, dt)

      // 自转：自动 + 拖拽惯性
      rec.spin += (rec.autoSpin + rec.spinVel) * dt
      rec.spinVel *= Math.pow(0.02, dt)

      // 悬浮漂移
      rec.group.position.y = rec.baseY + Math.sin(this.sharedTime.value * 0.5 + i * 1.7) * 0.06

      updateVinylRecordUniforms(rec)
    }
  }

  private updateCamera(dt: number) {
    const isClose = this.closeMode
    const rec = isClose ? this.records[this.selectedIndex] : null
    const targetPos = rec ? rec.group.position : ORIGIN
    const targetR = isClose ? this.closeRadius : PANO_RADIUS
    const yawT = isClose ? this.closeYaw : this.panoYaw
    const pitchT = isClose ? this.closePitch : this.panoPitch

    this.yaw = dampAngle(this.yaw, yawT, isClose ? 5 : 3.5, dt)
    this.pitch = damp(this.pitch, pitchT, isClose ? 5 : 3.5, dt)
    this.radius = damp(this.radius, targetR, 4, dt)

    const cosP = Math.cos(this.pitch)
    this.camera.position.set(
      targetPos.x + this.radius * cosP * Math.sin(this.yaw),
      targetPos.y + this.radius * Math.sin(this.pitch),
      targetPos.z + this.radius * cosP * Math.cos(this.yaw)
    )
    // 全景模式鼠标视差（仅在真实指针移动后生效）
    if (!isClose && this.pointerSeen) {
      this.camera.position.x += this.pointer.x * 0.22
      this.camera.position.y += this.pointer.y * 0.14
    }
    this.camera.lookAt(targetPos)
    if (!isClose) {
      this.camera.fov = damp(this.camera.fov, this.panoFov, 4, dt)
      this.camera.updateProjectionMatrix()
    }
  }

  // ---------- 事件 ----------
  private bindEvents() {
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    // click 兜底：极端情况下 pointerdown/up 被浏览器丢弃时仍能选中唱片
    el.addEventListener('click', this.onCanvasClick)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('dblclick', this.onDblClick)
    window.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private unbindEvents() {
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    el.removeEventListener('click', this.onCanvasClick)
    el.removeEventListener('wheel', this.onWheel)
    el.removeEventListener('dblclick', this.onDblClick)
    window.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private setPointerNdc(x: number, y: number) {
    const rect = this.container.getBoundingClientRect()
    this.pointer.x = ((x - rect.left) / Math.max(1, rect.width)) * 2 - 1
    this.pointer.y = -((y - rect.top) / Math.max(1, rect.height)) * 2 + 1
  }

  private hitTest(x: number, y: number): number | null {
    this.setPointerNdc(x, y)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.raycaster.params.Points!.threshold = 1.2
    const hits: { record: VinylRecord; dist: number }[] = []
    for (const rec of this.records) {
      const sphere = new THREE.Sphere(rec.group.position, 2.15)
      const ray = this.raycaster.ray
      if (ray.intersectsSphere(sphere)) {
        hits.push({ record: rec, dist: ray.origin.distanceTo(rec.group.position) })
      }
    }
    if (hits.length === 0) return null
    hits.sort((a, b) => a.dist - b.dist)
    return hits[0].record.index
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.dragging = true
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }
    this.lastPointer = { x: e.clientX, y: e.clientY }
    const hit = this.hitTest(e.clientX, e.clientY)
    if (hit !== null) {
      this.hoverIndex = hit
      this.callbacks.onHover?.(hit)
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    this.pointerSeen = true
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    // 双指捏合缩放
    if (this.pointers.size >= 2) {
      const pts = Array.from(this.pointers.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (this.pinchDist > 0 && dist > 0) {
        this.zoomBy(dist / this.pinchDist)
      }
      this.pinchDist = dist
      return
    }
    this.pinchDist = 0

    const dx = e.clientX - this.lastPointer.x
    const dy = e.clientY - this.lastPointer.y
    this.lastPointer = { x: e.clientX, y: e.clientY }

    if (this.dragging) {
      const hit = this.hitTest(e.clientX, e.clientY)
      if (hit !== null && !this.closeMode) {
        // 拖拽唱片：自转
        const rec = this.records[hit]
        rec.spin += dx * 0.018
        rec.spinVel = dx * 0.018
        this.hoverIndex = hit
        this.callbacks.onHover?.(hit)
      } else {
        // 拖拽空白：环视 / 特写轨道
        if (this.closeMode) {
          this.closeYaw -= dx * 0.0055
          this.closePitch = clamp(this.closePitch + dy * 0.0055, -1.15, 1.15)
        } else {
          this.panoYaw -= dx * 0.0055
          this.panoPitch = clamp(this.panoPitch + dy * 0.0045, -1.05, 1.05)
        }
      }
      return
    }

    // 悬停
    const hit = this.hitTest(e.clientX, e.clientY)
    if (hit !== this.hoverIndex) {
      this.hoverIndex = hit
      this.callbacks.onHover?.(hit)
      this.container.style.cursor = hit !== null ? 'pointer' : 'grab'
    }
  }

  private onPointerUp = (e: PointerEvent) => {
    this.lastPointerUpAt = performance.now()
    this.pointers.delete(e.pointerId)
    this.pinchDist = 0
    if (!this.dragging) return
    this.dragging = false
    this.container.style.cursor = 'grab'
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y)
    const dt = performance.now() - this.downAt.t
    if (moved > 7 || dt > 500) return
    // 单击
    const hit = this.hitTest(e.clientX, e.clientY)
    if (hit !== null) {
      if (this.closeMode && hit === this.selectedIndex) {
        // 已选中唱片再点：不动作（或翻转由拖拽处理）
        return
      }
      this.selectCity(hit, { close: true })
      this.hoverIndex = hit
      this.callbacks.onHover?.(hit)
    } else if (this.closeMode) {
      this.exitCloseup()
    }
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      this.zoomBy(e.deltaY > 0 ? 0.92 : 1.09)
      return
    }
    if (this.closeMode) {
      this.closeRadius = clamp(this.closeRadius * (e.deltaY > 0 ? 1.08 : 0.93), 2.2, 10)
      return
    }
    this.stepCity(e.deltaY > 0 ? 1 : -1)
  }

  private onCanvasClick = (e: MouseEvent) => {
    if (this.closeMode) return
    if (performance.now() - this.lastPointerUpAt < 600) return
    const hit = this.hitTest(e.clientX, e.clientY)
    if (hit !== null) this.selectCity(hit, { close: true })
  }

  private onDblClick = () => {
    if (this.closeMode) this.exitCloseup()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.closeMode) this.exitCloseup()
  }

  private onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf)
      this.started = false
    } else if (!this.started && !this.disposed) {
      this.lastTime = 0
      this.start()
    }
  }

  // ---------- 尺寸与销毁 ----------
  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.unbindEvents()
    this.resizeObs?.disconnect()
    for (const rec of this.records) {
      this.scene.remove(rec.group)
      rec.dispose()
    }
    for (const a of this.atlases) a.dispose()
    this.records = []
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
