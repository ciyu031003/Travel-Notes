'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
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

export default function ChinaMap({ posts }: ChinaMapProps) {
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [showCityModal, setShowCityModal] = useState(false)
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
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
  const offsetRef = useRef(offset)
  offsetRef.current = offset

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
        const key = `${city.name}-${findProvinceByLocation(post.location)?.id || ''}`
        if (!cityPostMap.has(key)) cityPostMap.set(key, [])
        cityPostMap.get(key)!.push(post)
      }
    }
    return cityPostMap
  }, [posts])

  const { paths, dashPath } = useMemo(() => {
    const projection = makeProjection(width, height, 24)
    const pathGen = makePath(projection)
    const litProvinceIds = new Set(postsByProvince.keys())

    const provincePaths: ProvincePath[] = chinaFeatures.map((feature) => {
      const id = provinceIdOf(feature)
      const province = getProvince(id)
      const d = pathGen(feature as never) || ''
      const centroid = pathGen.centroid(feature as never)
      return {
        id,
        d,
        name: province?.name || id,
        nameEn: province?.nameEn || id,
        lit: litProvinceIds.has(id),
        centroid: centroid[0] || centroid[1] ? [centroid[0], centroid[1]] : null,
      }
    })

    const dashD = dashLineFeature ? pathGen(dashLineFeature as never) || '' : ''
    return { paths: provincePaths, dashPath: dashD }
  }, [postsByProvince])

  const selectedPosts = selectedProvince ? postsByProvince.get(selectedProvince) || [] : []
  const selectedProvinceInfo = selectedProvince ? getProvince(selectedProvince) ?? null : null
  const selectedProvinceCities = selectedProvince ? getCitiesByProvince(selectedProvince) : []

  const cityPosts = useMemo(() => {
    if (!selectedCity || !selectedProvince) return []
    const key = `${selectedCity.name}-${selectedProvince}`
    return citiesByPostLocation.get(key) || []
  }, [selectedCity, selectedProvince, citiesByPostLocation])

  // 选中省份后，将该省每个城市按经纬度投影为地图上的圆点
  // 珠三角等城市密集区域圆点容易重叠，做一次简单的碰撞分散，确保每个城市点可被独立点击
  const cityDots = useMemo<CityDot[]>(() => {
    if (!selectedProvince) return []
    const projection = makeProjection(width, height, 24)
    const cities = getCitiesByProvince(selectedProvince)
    const dots: CityDot[] = []
    for (const city of cities) {
      const projected = projection([city.lng, city.lat])
      if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) continue
      const key = `${city.name}-${selectedProvince}`
      const posts = citiesByPostLocation.get(key) || []
      dots.push({
        city,
        x: Number(projected[0].toFixed(2)),
        y: Number(projected[1].toFixed(2)),
        hasPosts: posts.length > 0,
        count: posts.length,
      })
    }
    // 碰撞分散：两两距离小于 MIN_DIST 时沿连线方向把两者推开（多次迭代收敛）
    const MIN_DIST = 16
    const PAD = 40
    for (let iter = 0; iter < 60; iter++) {
      let moved = false
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          let dx = dots[j].x - dots[i].x
          let dy = dots[j].y - dots[i].y
          let dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MIN_DIST) {
            moved = true
            if (dist === 0) { dx = 1; dy = 0; dist = 1 }
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
    // 限制圆点落在视图范围内，避免被推出地图边缘
    for (const d of dots) {
      d.x = Math.max(PAD, Math.min(width - PAD, d.x))
      d.y = Math.max(PAD, Math.min(height - PAD, d.y))
    }
    return dots
  }, [selectedProvince, citiesByPostLocation])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    if (isDragging) {
      setOffset({
        x: initialOffset.x + (e.clientX - dragStart.x),
        y: initialOffset.y + (e.clientY - dragStart.y),
      })
      setLocated(false)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    suppressClickRef.current = false
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialOffset({ ...offset })
  }

  const handleMouseUp = () => setIsDragging(false)
  const handleMouseLeave = () => { setIsDragging(false); setHoveredProvince(null) }

  const zoomIn = () => { setScale((prev) => Math.min(MAX_SCALE, prev + 0.3)); setLocated(false) }
  const zoomOut = () => { setScale((prev) => Math.max(MIN_SCALE, prev - 0.3)); setLocated(false) }
  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }); setLocated(false) }

  const handleWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault()
    // ctrlKey+wheel = 触摸板双指捏合（桌面触控板同样受益）
    const step = e.ctrlKey ? 0.25 : 0.1
    const delta = e.deltaY > 0 ? -step : step
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
  const handleTouchStart = (e: React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    suppressClickRef.current = false
    const t = touchRef.current
    if (e.touches.length === 1) {
      t.mode = 'pan'
      t.startX = e.touches[0].clientX
      t.startY = e.touches[0].clientY
      t.initialOffset = { ...offsetRef.current }
      t.moved = false
    } else if (e.touches.length === 2) {
      t.mode = 'pinch'
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      t.pinchDist = Math.max(1, Math.hypot(dx, dy))
      t.pinchMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      }
      t.initialScale = scale
      t.initialOffset = { ...offsetRef.current }
      t.moved = false
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const t = touchRef.current
    if (t.mode === 'pan' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - t.startX
      const dy = e.touches[0].clientY - t.startY
      if (Math.abs(dx) + Math.abs(dy) > 8) t.moved = true
      setOffset({ x: t.initialOffset.x + dx, y: t.initialOffset.y + dy })
      setLocated(false)
    } else if (t.mode === 'pinch' && e.touches.length >= 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.max(1, Math.hypot(dx, dy))
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      }
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.initialScale * (dist / t.pinchDist)))
      // 保持双指中点下的地图点不动（围绕中点缩放）
      const wx = (t.pinchMid.x - t.initialOffset.x) / t.initialScale
      const wy = (t.pinchMid.y - t.initialOffset.y) / t.initialScale
      setScale(newScale)
      setOffset({ x: mid.x - wx * newScale, y: mid.y - wy * newScale })
      if (Math.abs(dist - t.pinchDist) > 4) t.moved = true
      setLocated(false)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const t = touchRef.current
    if (e.touches.length === 1 && t.mode === 'pinch') {
      // 双指抬起一根：退化为单指拖动
      t.mode = 'pan'
      t.startX = e.touches[0].clientX
      t.startY = e.touches[0].clientY
      t.initialOffset = { ...offsetRef.current }
      t.moved = false
      return
    }
    if (e.touches.length === 0) {
      suppressClickRef.current = t.moved
      t.mode = 'none'
      t.moved = false
    }
  }

  // 拖动/捏合后抑制浏览器合成的 click，避免误触省份
  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.stopPropagation()
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


  // ---- 单独显示省份：聚焦选中省份包围盒，其余省份变暗 ----
  const focusProvince = (provinceId: string) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    const feature = chinaFeatures.find((f) => provinceIdOf(f) === provinceId)
    if (!feature) return
    const projection = makeProjection(width, height, 24)
    const pathGen = makePath(projection)
    const bounds = pathGen.bounds(feature as never)
    if (!bounds || !Number.isFinite(bounds[0][0]) || !Number.isFinite(bounds[0][1])) return
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
  }
  const handleProvinceClick = (provinceId: string) => {
    setSelectedProvince(provinceId)
    setSelectedCity(null)
    setHoveredProvince(null)
    focusProvince(provinceId)
  }
  const handleCityClick = (city: City) => { setSelectedCity(city); setShowCityModal(true) }
  const closeCityModal = () => setShowCityModal(false)
  const backToProvinceList = () => setSelectedCity(null)

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClickCapture={handleClickCapture}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          // touch-action 只作用于地图内容层：地图区域独占手势，抽屉/弹窗/按钮不受影响
          touchAction: 'none',
        }}
      >
        <MapPaths paths={paths} dashPath={dashPath} hoveredProvince={hoveredProvince} selectedProvince={selectedProvince} cityDots={cityDots} onProvinceHover={setHoveredProvince} onProvinceClick={handleProvinceClick} onCityClick={handleCityClick} />
        <SouthChinaSeaInset />
      </div>

      <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} onLocate={focusLitProvinces} located={located} />

      {hoveredProvince && (
        <ProvinceTooltip province={paths.find((p) => p.id === hoveredProvince)} provincePosts={postsByProvince.get(hoveredProvince) || []} mousePos={mousePos} />
      )}

      <MapLegend />

      {selectedProvinceInfo && !selectedCity && (
        <ProvinceCityPanel provinceInfo={selectedProvinceInfo} cities={selectedProvinceCities} posts={selectedPosts} citiesWithPosts={citiesByPostLocation} onClose={() => { setSelectedProvince(null); resetZoom() }} onCityClick={handleCityClick} />
      )}

      {showCityModal && selectedCity && (
        <CityModal city={selectedCity} provinceInfo={selectedProvinceInfo} cityPosts={cityPosts} onClose={closeCityModal} onBack={backToProvinceList} />
      )}
    </div>
  )
}
