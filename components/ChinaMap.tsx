'use client'

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import {
  chinaFeatures,
  dashLineFeature,
  makeProjection,
  makePath,
  provinceIdOf,
} from '@/lib/geo'
import { getProvince } from '@/data/provinces'
import { getCitiesByProvince, findCityByName, type City } from '@/data/cities'
import { findProvinceByLocation } from '@/lib/province-map'
import { cn } from '@/lib/utils'
import MapPaths from './china-map/MapPaths'
import SouthChinaSeaInset from './china-map/SouthChinaSeaInset'
import ZoomControls from './china-map/ZoomControls'
import ProvinceTooltip from './china-map/ProvinceTooltip'
import MapLegend from './china-map/MapLegend'
import ProvinceCityPanel from './china-map/ProvinceCityPanel'
import CityModal from './china-map/CityModal'
import type { PostMeta, ProvincePath, CityDot } from './china-map/types'

export type { PostMeta } from './china-map/types'

export interface ChinaMapProps {
  posts: PostMeta[]
  /** 移动端由父级渲染底部抽屉，地图只负责选中与聚焦，不内嵌右侧/底部面板 */
  externalPanel?: boolean
  onProvinceSelect?: (provinceId: string) => void
  onCitySelect?: (city: City) => void
  /** 父级抽屉关闭时递增，用于清除地图内部选中态与缩放 */
  resetToken?: number
}

const width = 1100
const height = 860
const MIN_SCALE = 0.5
const MAX_SCALE = 4

interface TouchState {
  mode: 'none' | 'pan' | 'pinch'
  startX: number
  startY: number
  initialOffset: { x: number; y: number }
  initialScale: number
  pinchDist: number
  pinchMid: { x: number; y: number }
  moved: boolean
}

/* ============================================================================
 * 模块级几何缓存（性能）
 * ----------------------------------------------------------------------------
 * 旧实现每次点击省份都重新 makeProjection + makePath + pathGen.bounds：
 * 34 个 feature 的投影、path d 串生成、包围盒全部重算一遍，单次十几毫秒 ——
 * 在真机（4x 降速基准里）就是"点一下卡一下"。
 * 这些数据只和「地图尺寸 + 静态 GeoJSON」有关，与 posts / 选中态无关，
 * 因此第一次用到时算一遍、之后全程复用。
 * ========================================================================== */
type ProvinceBounds = [[number, number], [number, number]]

interface ProvinceGeometry extends Omit<ProvincePath, 'lit'> {
  bounds: ProvinceBounds | null
}

interface MapGeometry {
  provinces: ProvinceGeometry[]
  dashPath: string
  byId: Map<string, ProvinceGeometry>
}

let projectionCache: ReturnType<typeof makeProjection> | null = null
let geometryCache: MapGeometry | null = null

function getProjection() {
  if (!projectionCache) projectionCache = makeProjection(width, height, 24)
  return projectionCache
}

function getGeometry(): MapGeometry {
  if (geometryCache) return geometryCache
  const pathGen = makePath(getProjection())
  const provinces: ProvinceGeometry[] = chinaFeatures.map((feature) => {
    const id = provinceIdOf(feature)
    const province = getProvince(id)
    const centroid = pathGen.centroid(feature as never)
    const bounds = pathGen.bounds(feature as never)
    const hasBounds = !!bounds && Number.isFinite(bounds[0][0]) && Number.isFinite(bounds[0][1])
    return {
      id,
      d: pathGen(feature as never) || '',
      name: province?.name || id,
      nameEn: province?.nameEn || id,
      centroid: centroid[0] || centroid[1] ? [centroid[0], centroid[1]] : null,
      bounds: hasBounds ? (bounds as ProvinceBounds) : null,
    }
  })
  const dashPath = dashLineFeature ? pathGen(dashLineFeature as never) || '' : ''
  geometryCache = { provinces, dashPath, byId: new Map(provinces.map((p) => [p.id, p])) }
  return geometryCache
}

interface CityDotBase {
  city: City
  x: number
  y: number
}

/** 省份内城市的投影点（含一次性碰撞分散）：与 posts 无关，按省份缓存 */
const cityDotBaseCache = new Map<string, CityDotBase[]>()

/**
 * 城市点位的碰撞分散。
 * 旧实现固定 60 轮两两比较、且每次选中省份都重算；现在结果按省份缓存，
 * 并把迭代上限降到 24 轮（MIN_DIST 16px 的密集区通常 6~10 轮就收敛，
 * 60 轮对 20 个城市约 1.1 万次比较，纯属浪费）。
 */
function getCityDotBase(provinceId: string): CityDotBase[] {
  const cached = cityDotBaseCache.get(provinceId)
  if (cached) return cached
  const projection = getProjection()
  const dots: CityDotBase[] = []
  for (const city of getCitiesByProvince(provinceId)) {
    const projected = projection([city.lng, city.lat])
    if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) continue
    dots.push({ city, x: Number(projected[0].toFixed(2)), y: Number(projected[1].toFixed(2)) })
  }
  const MIN_DIST = 16
  const PAD = 40
  if (dots.length > 1) {
    for (let iter = 0; iter < 24; iter++) {
      let moved = false
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          let dx = dots[j].x - dots[i].x
          let dy = dots[j].y - dots[i].y
          let dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MIN_DIST) {
            moved = true
            if (dist === 0) {
              dx = 1
              dy = 0
              dist = 1
            }
            const push = (MIN_DIST - dist) / 2
            const nx = dx / dist
            const ny = dy / dist
            dots[i].x -= nx * push
            dots[i].y -= ny * push
            dots[j].x += nx * push
            dots[j].y += ny * push
          }
        }
      }
      if (!moved) break
    }
  }
  for (const dot of dots) {
    dot.x = Math.max(PAD, Math.min(width - PAD, dot.x))
    dot.y = Math.max(PAD, Math.min(height - PAD, dot.y))
  }
  cityDotBaseCache.set(provinceId, dots)
  return dots
}

export default function ChinaMap({ posts, externalPanel = false, onProvinceSelect, onCitySelect, resetToken }: ChinaMapProps) {
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [showCityModal, setShowCityModal] = useState(false)
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  /** 触摸手势进行中（拖拽/捏合）：transform 过渡必须关掉，否则跟手有拖影 */
  const [interacting, setInteracting] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 })
  const [located, setLocated] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<TouchState>({
    mode: 'none', startX: 0, startY: 0,
    initialOffset: { x: 0, y: 0 }, initialScale: 1,
    pinchDist: 0, pinchMid: { x: 0, y: 0 }, moved: false,
  })
  const suppressClickRef = useRef(false)
  const dragMovedRef = useRef(false)
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  /** 父级回调放 ref：事件处理函数保持稳定身份，memo 的地图子层不会被父级渲染带着重渲 */
  const onProvinceSelectRef = useRef(onProvinceSelect)
  const onCitySelectRef = useRef(onCitySelect)
  useEffect(() => {
    onProvinceSelectRef.current = onProvinceSelect
    onCitySelectRef.current = onCitySelect
  }, [onProvinceSelect, onCitySelect])
  const externalPanelRef = useRef(externalPanel)
  useEffect(() => {
    externalPanelRef.current = externalPanel
  }, [externalPanel])
  /** 悬停态 / 鼠标坐标放 ref 判重，避免 mousemove 每帧 setState */
  const hoveredProvinceRef = useRef<string | null>(null)
  const mousePosRef = useRef({ x: 0, y: 0 })
  const mouseRafRef = useRef<number | null>(null)

  const postsByProvince = useMemo(() => {
    const map = new Map<string, PostMeta[]>()
    for (const post of posts) {
      if (!post.location) continue
      const province = findProvinceByLocation(post.location)
      if (province) {
        if (!map.has(province.id)) map.set(province.id, [])
        map.get(province.id)!.push(post)
      }
    }
    return map
  }, [posts])

  const citiesByPostLocation = useMemo(() => {
    const cityPostMap = new Map<string, PostMeta[]>()
    for (const post of posts) {
      if (!post.location) continue
      const city = findCityByName(post.location)
      if (city) {
        const provinceId = findProvinceByLocation(post.location)?.id || ''
        const key = city.name + '-' + provinceId
        if (!cityPostMap.has(key)) cityPostMap.set(key, [])
        cityPostMap.get(key)!.push(post)
      }
    }
    return cityPostMap
  }, [posts])

  /** 静态几何 + 是否点亮（只有 posts 变化时才重建数组，d/centroid/bounds 复用缓存） */
  const paths = useMemo<ProvincePath[]>(() => {
    const geo = getGeometry()
    const litProvinceIds = new Set(postsByProvince.keys())
    return geo.provinces.map((province) => ({
      id: province.id,
      d: province.d,
      name: province.name,
      nameEn: province.nameEn,
      centroid: province.centroid,
      lit: litProvinceIds.has(province.id),
    }))
  }, [postsByProvince])
  const dashPath = useMemo(() => getGeometry().dashPath, [])
  /** 选中省份的几何对象：引用来自 paths（稳定），选中叠加层据此单独渲染 */
  const selectedPath = useMemo(
    () => (selectedProvince ? paths.find((p) => p.id === selectedProvince) ?? null : null),
    [paths, selectedProvince],
  )

  const selectedPosts = selectedProvince ? postsByProvince.get(selectedProvince) || [] : []
  const selectedProvinceInfo = selectedProvince ? getProvince(selectedProvince) ?? null : null
  const selectedProvinceCities = selectedProvince ? getCitiesByProvince(selectedProvince) : []

  const cityPosts = useMemo(() => {
    if (!selectedCity || !selectedProvince) return []
    const key = selectedCity.name + '-' + selectedProvince
    return citiesByPostLocation.get(key) || []
  }, [selectedCity, selectedProvince, citiesByPostLocation])

  /** 城市圆点：投影/碰撞结果按省份缓存，这里只叠加「有没有记录」 */
  const cityDots = useMemo<CityDot[]>(() => {
    if (!selectedProvince) return []
    return getCityDotBase(selectedProvince).map((base) => {
      const postsOfCity = citiesByPostLocation.get(base.city.name + '-' + selectedProvince)
      return {
        city: base.city,
        x: base.x,
        y: base.y,
        hasPosts: !!postsOfCity && postsOfCity.length > 0,
        count: postsOfCity?.length ?? 0,
      }
    })
  }, [selectedProvince, citiesByPostLocation])

  // ── 鼠标悬停：事件委托 + 只在换省份时 setState（不再从 MapPaths 传 hover props）──
  const handleHoverOver = useCallback((event: React.MouseEvent) => {
    if (dragMovedRef.current) return
    const target = event.target as Element | null
    const el = target && typeof target.closest === 'function' ? target.closest('[data-province-id]') : null
    const id = el ? el.getAttribute('data-province-id') : null
    if (id === hoveredProvinceRef.current) return
    hoveredProvinceRef.current = id
    setHoveredProvince(id)
  }, [])

  const handleMouseMove = (event: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    // 只有提示气泡可见时才需要坐标：rAF 节流，避免 mousemove 每帧重渲整棵树
    if (hoveredProvinceRef.current) {
      mousePosRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      if (mouseRafRef.current === null) {
        mouseRafRef.current = requestAnimationFrame(() => {
          mouseRafRef.current = null
          setMousePos(mousePosRef.current)
        })
      }
    }
    if (isDragging) {
      // 拖拽位移超过阈值才视为拖动，避免点击误判
      if (Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 4) {
        dragMovedRef.current = true
      }
      setOffset({
        x: initialOffset.x + (event.clientX - dragStart.x),
        y: initialOffset.y + (event.clientY - dragStart.y),
      })
      setLocated(false)
    }
  }

  /** 拖拽/触摸开始即清掉悬停：平移过程中不该弹提示气泡（里面有图片，要额外解码） */
  const clearHover = () => {
    if (mouseRafRef.current !== null) {
      cancelAnimationFrame(mouseRafRef.current)
      mouseRafRef.current = null
    }
    if (hoveredProvinceRef.current !== null) {
      hoveredProvinceRef.current = null
      setHoveredProvince(null)
    }
  }

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return
    clearHover()
    suppressClickRef.current = false
    dragMovedRef.current = false
    setIsDragging(true)
    setDragStart({ x: event.clientX, y: event.clientY })
    setInitialOffset({ ...offset })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    // 真正的拖拽/捏合后抑制合成 click，避免触发省份选中或空白返回
    if (dragMovedRef.current) {
      suppressClickRef.current = true
      dragMovedRef.current = false
    }
  }
  const handleMouseLeave = () => {
    setIsDragging(false)
    if (mouseRafRef.current !== null) {
      cancelAnimationFrame(mouseRafRef.current)
      mouseRafRef.current = null
    }
    hoveredProvinceRef.current = null
    setHoveredProvince(null)
  }

  useEffect(
    () => () => {
      if (mouseRafRef.current !== null) cancelAnimationFrame(mouseRafRef.current)
    },
    [],
  )

  const zoomIn = () => { setScale((prev) => Math.min(MAX_SCALE, prev + 0.3)); setLocated(false) }
  const zoomOut = () => { setScale((prev) => Math.max(MIN_SCALE, prev - 0.3)); setLocated(false) }
  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }); setLocated(false) }

  const handleWheelNative = useCallback((event: WheelEvent) => {
    event.preventDefault()
    // ctrlKey+wheel = 触摸板双指捏合（桌面触控板同样受益）
    const step = event.ctrlKey ? 0.25 : 0.1
    const delta = event.deltaY > 0 ? -step : step
    setScale((prev) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev + delta)))
    setLocated(false)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => container.removeEventListener('wheel', handleWheelNative)
  }, [handleWheelNative])

  // ---- 触摸手势：单指拖动 / 双指缩放（touch-action:none 由容器 style 提供） ----
  const handleTouchStart = (event: React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    suppressClickRef.current = false
    clearHover()
    const touch = touchRef.current
    setInteracting(true)
    if (event.touches.length === 1) {
      touch.mode = 'pan'
      touch.startX = event.touches[0].clientX
      touch.startY = event.touches[0].clientY
      touch.initialOffset = { ...offsetRef.current }
      touch.moved = false
    } else if (event.touches.length === 2) {
      touch.mode = 'pinch'
      const dx = event.touches[1].clientX - event.touches[0].clientX
      const dy = event.touches[1].clientY - event.touches[0].clientY
      touch.pinchDist = Math.max(1, Math.hypot(dx, dy))
      touch.pinchMid = {
        x: (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left,
        y: (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top,
      }
      touch.initialScale = scale
      touch.initialOffset = { ...offsetRef.current }
      touch.moved = false
    }
  }

  const handleTouchMove = (event: React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const touch = touchRef.current
    if (touch.mode === 'pan' && event.touches.length === 1) {
      const dx = event.touches[0].clientX - touch.startX
      const dy = event.touches[0].clientY - touch.startY
      if (Math.abs(dx) + Math.abs(dy) > 8) touch.moved = true
      setOffset({ x: touch.initialOffset.x + dx, y: touch.initialOffset.y + dy })
      setLocated(false)
    } else if (touch.mode === 'pinch' && event.touches.length >= 2) {
      const dx = event.touches[1].clientX - event.touches[0].clientX
      const dy = event.touches[1].clientY - event.touches[0].clientY
      const dist = Math.max(1, Math.hypot(dx, dy))
      const mid = {
        x: (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left,
        y: (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top,
      }
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, touch.initialScale * (dist / touch.pinchDist)))
      // 保持双指中点下的地图点不动（围绕中点缩放）
      const wx = (touch.pinchMid.x - touch.initialOffset.x) / touch.initialScale
      const wy = (touch.pinchMid.y - touch.initialOffset.y) / touch.initialScale
      setScale(newScale)
      setOffset({ x: mid.x - wx * newScale, y: mid.y - wy * newScale })
      if (Math.abs(dist - touch.pinchDist) > 4) touch.moved = true
      setLocated(false)
    }
  }

  const handleTouchEnd = (event: React.TouchEvent) => {
    const touch = touchRef.current
    if (event.touches.length === 1 && touch.mode === 'pinch') {
      // 双指抬起一根：退化为单指拖动
      touch.mode = 'pan'
      touch.startX = event.touches[0].clientX
      touch.startY = event.touches[0].clientY
      touch.initialOffset = { ...offsetRef.current }
      touch.moved = false
      return
    }
    if (event.touches.length === 0) {
      suppressClickRef.current = touch.moved
      touch.mode = 'none'
      touch.moved = false
      setInteracting(false)
    }
  }

  // 拖动/捏合后抑制浏览器合成的 click，避免误触省份
  const handleClickCapture = (event: React.MouseEvent) => {
    if (suppressClickRef.current) {
      event.stopPropagation()
      suppressClickRef.current = false
    }
  }

  // ---- 回到旅行位置：聚焦已探索省份包围盒 ----
  const focusLitProvinces = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    if (located) { resetZoom(); return }
    const lit = paths.filter((p) => p.lit && p.centroid)
    if (lit.length === 0) { resetZoom(); return }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of lit) {
      const [x, y] = p.centroid!
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const pad = Math.min(rect.width, rect.height) * 0.16
    const bboxW = Math.max(1, maxX - minX)
    const bboxH = Math.max(1, maxY - minY)
    const s = Math.min((rect.width - pad) / bboxW, (rect.height - pad) / bboxH, 3.2)
    const clamped = Math.max(MIN_SCALE, s)
    const center = { x: rect.width / 2, y: rect.height / 2 }
    const bc = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    setScale(clamped)
    setOffset({ x: center.x - bc.x * clamped, y: center.y - bc.y * clamped })
    setLocated(true)
  }

  /**
   * 单独显示省份：聚焦选中省份包围盒。
   * 旧实现每次点击都 makeProjection + makePath + bounds 重算全部 34 个 feature；
   * 现在从模块级几何缓存直接取包围盒（O(1)）。
   */
  const focusProvince = useCallback((provinceId: string) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    const bounds = getGeometry().byId.get(provinceId)?.bounds
    if (!bounds) return
    const [topLeft, bottomRight] = bounds
    const vbW = Math.max(1, bottomRight[0] - topLeft[0])
    const vbH = Math.max(1, bottomRight[1] - topLeft[1])
    const bc = { x: (topLeft[0] + bottomRight[0]) / 2, y: (topLeft[1] + bottomRight[1]) / 2 }
    // viewBox 到容器像素的缩放与偏移（SVG preserveAspectRatio=meet）
    const k = Math.min(rect.width / width, rect.height / height)
    const cx0 = (rect.width - width * k) / 2
    const cy0 = (rect.height - height * k) / 2
    // 目标屏幕中心：预留右侧面板（桌面 md+ 面板宽约 380px）
    const panelW = typeof window !== 'undefined' && window.innerWidth >= 768 ? 380 : 0
    const pad = Math.min(rect.width, rect.height) * 0.1
    const availW = Math.max(1, rect.width - panelW - pad * 2)
    const availH = Math.max(1, rect.height - pad * 2)
    let s = Math.min(availW / (vbW * k), availH / (vbH * k))
    s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s))
    const center = { x: rect.width / 2, y: rect.height / 2 }
    const target = { x: (rect.width - panelW) / 2, y: rect.height / 2 }
    const pbc = { x: cx0 + bc.x * k, y: cy0 + bc.y * k }
    const ox = target.x - center.x - (pbc.x - center.x) * s
    const oy = target.y - center.y - (pbc.y - center.y) * s
    setScale(s)
    setOffset({ x: ox, y: oy })
    setLocated(true)
  }, [])

  const handleProvinceClick = useCallback(
    (provinceId: string) => {
      // 抽屉优先：父级的 urgent 更新先提交（用户先看到面板）；
      // 地图的变暗/聚焦交给 transition，避免和抽屉 mount 挤在同一帧跑两份重活。
      onProvinceSelectRef.current?.(provinceId)
      startTransition(() => {
        setSelectedProvince(provinceId)
        setSelectedCity(null)
        setHoveredProvince(null)
        hoveredProvinceRef.current = null
        focusProvince(provinceId)
      })
    },
    [focusProvince],
  )

  const handleCityClick = useCallback((nextCity: City) => {
    setSelectedCity(nextCity)
    if (externalPanelRef.current && onCitySelectRef.current) {
      onCitySelectRef.current(nextCity)
    } else {
      setShowCityModal(true)
    }
  }, [])

  const closeCityModal = () => setShowCityModal(false)
  const backToProvinceList = () => setSelectedCity(null)

  // 父级关闭右下抽屉时，重置地图选中/缩放（移动端外部面板模式）
  useEffect(() => {
    if (externalPanel && resetToken != null && resetToken !== 0) {
      setSelectedProvince(null)
      setSelectedCity(null)
      setShowCityModal(false)
      resetZoom()
    }
  }, [resetToken, externalPanel])

  // 点击省份放大后，点击地图空白区域（非省份/城市/控件/弹层）回到全国视图
  const handleMapClick = (event: React.MouseEvent) => {
    if (!selectedProvince) return
    // 从事件目标向上查找，命中省份、城市圆点或地图 UI 覆盖层时交由对应逻辑处理
    let el: Element | null = event.target as Element | null
    while (el && el !== containerRef.current) {
      if (
        el.getAttribute?.('data-province-id') ||
        el.getAttribute?.('data-city-id') ||
        el.getAttribute?.('data-map-overlay')
      ) {
        return
      }
      el = el.parentElement
    }
    // 空白区域：清除省份聚焦与城市弹窗，恢复全国视图
    setSelectedProvince(null)
    setSelectedCity(null)
    setHoveredProvince(null)
    hoveredProvinceRef.current = null
    setShowCityModal(false)
    resetZoom()
  }

  const stageInteracting = isDragging || interacting

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      // 地图平移与全局左缘右滑返回是同形手势（横向拖动）：不豁免的话，
      // 从地图左缘 24px 起手横拖会同时平移地图并把整页"滑走"（真机 bug）
      data-no-swipeback=""
      onMouseMove={handleMouseMove}
      onMouseOver={handleHoverOver}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClickCapture={handleClickCapture}
      onClick={handleMapClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ cursor: stageInteracting ? 'grabbing' : 'grab' }}
    >
      {/*
        地图内容层：平移/缩放/聚焦只改 transform，靠 .m-map-stage 的
        will-change + contain 提升为合成层 —— SVG（34 条路径 + 高斯模糊滤镜）
        不再随每一帧位移整层重绘。
      */}
      <div
        className={cn('m-map-stage absolute inset-0', stageInteracting ? 'm-map-stage--drag' : 'm-map-stage--anim')}
        style={{
          transform: 'translate(' + offset.x + 'px, ' + offset.y + 'px) scale(' + scale + ')',
          transformOrigin: 'center center',
          // touch-action 只作用于地图内容层：地图区域独占手势，抽屉/弹窗/按钮不受影响
          touchAction: 'none',
        }}
      >
        <MapPaths
          paths={paths}
          dashPath={dashPath}
          selectedProvince={selectedProvince}
          selectedPath={selectedPath}
          cityDots={cityDots}
          onProvinceClick={handleProvinceClick}
          onCityClick={handleCityClick}
        />
        <SouthChinaSeaInset />
      </div>

      <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} onLocate={focusLitProvinces} located={located} />

      {hoveredProvince && (
        <ProvinceTooltip province={paths.find((p) => p.id === hoveredProvince)} provincePosts={postsByProvince.get(hoveredProvince) || []} mousePos={mousePos} />
      )}

      <MapLegend />

      {!externalPanel && selectedProvinceInfo && !selectedCity && (
        <ProvinceCityPanel provinceInfo={selectedProvinceInfo} cities={selectedProvinceCities} posts={selectedPosts} citiesWithPosts={citiesByPostLocation} onClose={() => { setSelectedProvince(null); resetZoom() }} onCityClick={handleCityClick} />
      )}

      {!externalPanel && showCityModal && selectedCity && (
        <CityModal city={selectedCity} provinceInfo={selectedProvinceInfo} cityPosts={cityPosts} onClose={closeCityModal} onBack={backToProvinceList} />
      )}
    </div>
  )
}