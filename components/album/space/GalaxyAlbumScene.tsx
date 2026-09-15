'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { Loader2, MessageCircle, Sparkles, RotateCcw, ArrowLeft, BookOpen } from 'lucide-react'
import { GalaxyAlbumEngine } from './galaxyEngine'
import type { CityData } from './particlePhoto'
import SpaceAlbumHUD from './SpaceAlbumHUD'
import { Icon } from '@/components/mobile/Icon'
import { albumModeOf } from '@/lib/album-modes'

/** 模式文案/图标统一取自 lib/album-modes */
const PIXEL_MODE = albumModeOf('pixel')
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
      <div className="fixed inset-0 z-[90] bg-album-bg0 flex flex-col items-center justify-center gap-4">
        {/* 空态也保留顶栏（返回首页 + 标题 + 模式切换），与像素/画册模式同构，避免被困在空银河 */}
        <header className="absolute top-0 inset-x-0 z-40 flex h-14 items-center justify-between gap-2 px-3 md:px-8 space-glass rounded-none border-x-0 border-t-0">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full space-glass-btn text-album-text1 text-xs"
            >
              <Icon icon={ArrowLeft} size="sm" />
              返回
            </a>
            <div className="flex items-center gap-2 min-w-0">
              <Icon icon={BookOpen} size="sm" className="shrink-0 text-album-accent" />
              <h1 className="text-album-text1 text-sm font-semibold tracking-widest truncate">银河相册</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onTogglePixel}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full space-glass-btn text-album-text1 text-xs font-bold"
            title={PIXEL_MODE.title}
          >
            <Icon icon={PIXEL_MODE.icon} size="sm" />
            {PIXEL_MODE.label}
          </button>
        </header>
        <Icon icon={Sparkles} size="lg" className="text-album-accent" />
        <p className="text-album-text2 text-sm tracking-widest">银河中还没有旅行唱片</p>
        <p className="text-album-text2 text-xs">等待新的旅行记忆被点亮...</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[90] bg-album-bg0 overflow-hidden">
      {/* Three.js 画布 */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* 加载态 */}
      {!ready && !failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-album-bg0">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border border-white/15" />
            <div className="absolute inset-0 rounded-full border-t-2 border-album-accent animate-spin" />
            <Icon icon={Sparkles} size="md" className="absolute inset-0 m-auto text-album-accent" />
          </div>
          <p className="text-album-text2 text-sm tracking-widest">正在唤醒银河，装载旅行唱片...</p>
          <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-album-accentStrong to-album-accent transition-all duration-300"
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>
          <p className="text-album-text2 text-xs">{progress}%</p>
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
                    <h2 className="text-album-text1 text-lg font-bold tracking-widest truncate">{city.name} · 记忆唱片</h2>
                    <p className="text-album-text2 text-xs mt-1">
                      {formatDate(city.date)} · {city.images.length} 张照片
                      {city.province ? ` · ${city.province}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.exitCloseup()}
                    className="space-glass-btn rounded-full px-3 py-1.5 flex items-center gap-1.5 text-album-text1 text-xs shrink-0"
                  >
                    <Icon icon={RotateCcw} size="sm" />
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
                      <Image
                        src={img}
                        alt={`${city.name} ${i + 1}`}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                        <Icon icon={MessageCircle} size="sm" className="text-album-accent opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-xs text-album-text2 text-center">
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

