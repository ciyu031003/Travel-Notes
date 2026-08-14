'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, MessageCircle, Sparkles, RotateCcw } from 'lucide-react'
import { GalaxyAlbumEngine } from './galaxyEngine'
import type { CityData } from './particlePhoto'
import SpaceAlbumHUD from './SpaceAlbumHUD'
import SpaceRadar from './SpaceRadar'
import GlassPanel from './GlassPanel'

export interface SpaceChatPhoto {
  url: string
  key: string
  cityName: string
  date: string
}

interface GalaxyAlbumSceneProps {
  cities: CityData[]
  onTogglePixel: () => void
  onOpenChat: (photo: SpaceChatPhoto) => void
  onWebGLFail: () => void
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}

/**
 * 银河全景唱片相册（Three.js）：
 * - 挂载引擎画布，管理 HUD / 雷达 / 玻璃信息面板 / 加载态
 */
export default function GalaxyAlbumScene({
  cities,
  onTogglePixel,
  onOpenChat,
  onWebGLFail,
}: GalaxyAlbumSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GalaxyAlbumEngine | null>(null)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [closeup, setCloseup] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || cities.length === 0) return
    const engine = new GalaxyAlbumEngine(mount, {
      onSelect: (i) => setIndex(i),
      onCloseup: (c) => setCloseup(c),
      onHover: (i) => setHovered(i),
      onProgress: (done, total) => setProgress(total ? Math.round((done / total) * 100) : 100),
      onReady: () => setReady(true),
    })
    engineRef.current = engine
    engine.load(cities).catch((err) => {
      console.error('[GalaxyAlbum] load failed', err)
      setFailed(true)
    })
    return () => {
      engine.dispose()
      engineRef.current = null
      setReady(false)
      setProgress(0)
      setCloseup(false)
    }
  }, [cities])

  useEffect(() => {
    if (failed) onWebGLFail()
  }, [failed, onWebGLFail])

  const city = cities[index]

  const handleOpenChat = useCallback(
    (photoUrl: string) => {
      if (!city) return
      onOpenChat({
        url: photoUrl,
        key: photoUrl,
        cityName: city.name,
        date: formatDate(city.date),
      })
    },
    [city, onOpenChat]
  )

  if (cities.length === 0) {
    return (
      <div className="fixed inset-0 z-[90] bg-[#050508] flex flex-col items-center justify-center gap-4">
        <Sparkles className="w-10 h-10 text-amber-200/60" />
        <p className="text-white/70 text-sm tracking-widest">银河中还没有旅行唱片</p>
        <p className="text-white/35 text-xs">等待新的旅行记忆被点亮...</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[90] bg-[#050508] overflow-hidden">
      {/* Three.js 画布 */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* 加载态 */}
      {!ready && !failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#050508]">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border border-white/15" />
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-200/80 animate-spin" />
            <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-amber-200/70" />
          </div>
          <p className="text-white/70 text-sm tracking-widest">正在唤醒银河，装载旅行唱片...</p>
          <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-400 to-amber-200 transition-all duration-300"
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>
          <p className="text-white/35 text-[11px]">{progress}%</p>
        </div>
      )}

      {ready && (
        <>
          <SpaceAlbumHUD
            cities={cities}
            index={index}
            hovered={hovered}
            closeup={closeup}
            onTogglePixel={onTogglePixel}
            onPrev={() => engineRef.current?.stepCity(-1)}
            onNext={() => engineRef.current?.stepCity(1)}
            onZoomIn={() => engineRef.current?.zoomBy(0.85)}
            onZoomOut={() => engineRef.current?.zoomBy(1.18)}
            onExitCloseup={() => engineRef.current?.exitCloseup()}
          />

          <SpaceRadar
            cities={cities}
            currentIndex={index}
            onSelect={(i) => engineRef.current?.selectCity(i, { close: true })}
          />

          {/* 选中唱片：玻璃信息面板 */}
          {closeup && city && (
            <div className="absolute z-30 left-1/2 -translate-x-1/2 top-16 sm:top-20 w-[min(92vw,560px)]">
              <GlassPanel className="p-4 sm:p-5 rounded-3xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-white/95 text-lg font-bold tracking-widest truncate">{city.name} · 记忆唱片</h2>
                    <p className="text-white/50 text-xs mt-1">
                      {formatDate(city.date)} · {city.images.length} 张照片
                      {city.province ? ` · ${city.province}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.exitCloseup()}
                    className="space-glass-btn rounded-full px-3 py-1.5 flex items-center gap-1.5 text-white/80 text-xs shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    返回银河
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {city.images.slice(0, 12).map((img, i) => (
                    <button
                      key={`${img}-${i}`}
                      type="button"
                      onClick={() => handleOpenChat(img)}
                      className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group"
                      title={`点击查看照片并留言`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img}
                        alt={`${city.name} ${i + 1}`}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                        <MessageCircle className="w-4 h-4 text-amber-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[10px] text-white/40 text-center">
                  点击照片开启该照片专属的星河留言
                </p>
              </GlassPanel>
            </div>
          )}
        </>
      )}
    </div>
  )
}
