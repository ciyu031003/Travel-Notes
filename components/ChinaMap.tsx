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
import type { PostMeta, ProvincePath } from './china-map/types'

export type { PostMeta } from './china-map/types'

export interface ChinaMapProps {
  posts: PostMeta[]
}

const width = 1100
const height = 860

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
  const containerRef = useRef<HTMLDivElement>(null)

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

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    if (isDragging) {
      setOffset({
        x: initialOffset.x + (e.clientX - dragStart.x),
        y: initialOffset.y + (e.clientY - dragStart.y),
      })
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialOffset({ ...offset })
  }

  const handleMouseUp = () => setIsDragging(false)
  const handleMouseLeave = () => { setIsDragging(false); setHoveredProvince(null) }
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale((prev) => Math.max(0.5, Math.min(4, prev + delta)))
  }
  const zoomIn = () => setScale((prev) => Math.min(4, prev + 0.3))
  const zoomOut = () => setScale((prev) => Math.max(0.5, prev - 0.3))
  const resetZoom = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  const handleWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale((prev) => Math.max(0.5, Math.min(4, prev + delta)))
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => container.removeEventListener('wheel', handleWheelNative)
  }, [handleWheelNative])

  const handleProvinceClick = (provinceId: string) => {
    setSelectedProvince(provinceId)
    setSelectedCity(null)
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
      onWheel={handleWheel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        <MapPaths paths={paths} dashPath={dashPath} hoveredProvince={hoveredProvince} selectedProvince={selectedProvince} onProvinceHover={setHoveredProvince} onProvinceClick={handleProvinceClick} />
        <SouthChinaSeaInset />
      </div>

      <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />

      {hoveredProvince && (
        <ProvinceTooltip province={paths.find((p) => p.id === hoveredProvince)} provincePosts={postsByProvince.get(hoveredProvince) || []} mousePos={mousePos} />
      )}

      <MapLegend />

      {selectedProvinceInfo && !selectedCity && (
        <ProvinceCityPanel provinceInfo={selectedProvinceInfo} cities={selectedProvinceCities} posts={selectedPosts} citiesWithPosts={citiesByPostLocation} onClose={() => setSelectedProvince(null)} onCityClick={handleCityClick} />
      )}

      {showCityModal && selectedCity && (
        <CityModal city={selectedCity} provinceInfo={selectedProvinceInfo} cityPosts={cityPosts} onClose={closeCityModal} onBack={backToProvinceList} />
      )}
    </div>
  )
}
