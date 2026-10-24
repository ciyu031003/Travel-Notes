'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamicImport from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'
import PixelDeskBackground from '@/components/album/PixelDeskBackground'
import AlbumCoverBanner from '@/components/album/AlbumCoverBanner'
import AlbumSpaceMode, { type SpaceChatPhoto } from '@/components/album/AlbumSpaceMode'
import TravelArchiveView from '@/components/album/TravelArchiveView'
import TravelBook from '@/components/album/travel-book/TravelBook'
import PixelPhotoChat from '@/components/album/PixelPhotoChat'
import AlbumComposer from '@/components/album/AlbumComposer'
import AlbumHeader from '@/components/album/AlbumHeader'
import AlbumBookshelf from '@/components/album/AlbumBookshelf'
import AlbumUnlockScreen from '@/components/album/AlbumUnlockScreen'
import AlbumGalleryGrid from '@/components/album/AlbumGalleryGrid'
import AlbumPhotoWall from '@/components/album/AlbumPhotoWall'
import AlbumStarMapOverlay from '@/components/album/AlbumStarMapOverlay'
import type { AlbumViewMode } from '@/components/album/AlbumModeSwitch'
import { useAlbumData } from '@/hooks/use-album-data'
import { formatDotDate } from '@/lib/modules/album/presentation'
import { isNativePlatform } from '@/lib/modules/offline/platform'

// v3.1 M3-D2：Canvas/WebGL 重组件按需加载（首屏不打包；渲染时才拉取）
const PhotoMorphViewer = dynamicImport(() => import('@/components/album/PhotoMorphViewer'), { ssr: false })


/**
 * 相册页（P2-32 拆分后）：只保留「模式编排 + 动态渲染器装配 + 浮层编排」。
 *
 * 取数/派生   → hooks/use-album-data.ts
 * 模式切换按钮 → components/album/AlbumModeSwitch.tsx
 * 顶部导航     → components/album/AlbumHeader.tsx
 * 左侧书架     → components/album/AlbumBookshelf.tsx
 * 未解锁皮肤   → components/album/AlbumUnlockScreen.tsx
 * 纪念相册区   → components/album/AlbumGalleryGrid.tsx
 *
 * 行为契约（与拆分前一致）：
 * - 默认 book 模式；URL ?book= 深链只读一次；localStorage 仅恢复 pixel（space 不恢复）；
 * - 5 个重型渲染器继续 dynamic({ssr:false}) + ErrorBoundary 包裹；
 * - 模式切换写 localStorage、WebGL 失败降级到 pixel。
 */
export default function AlbumPage() {
  const {
    cities,
    albums,
    loading,
    checkingLock,
    isUnlocked,
    selectedCity,
    setSelectedCity,
    refresh,
    reload,
    totalPhotos,
    totalDays,
    starCities,
  } = useAlbumData()

  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [showStarMap, setShowStarMap] = useState(false)
  const [chatPhoto, setChatPhoto] = useState<SpaceChatPhoto | null>(null)
  const [view, setView] = useState<'gallery' | 'chat'>('gallery')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  // 深链直达：/album?book=<bookKey>（首页画册目录 → 直开某城市画册）
  const [initialBookKey, setInitialBookKey] = useState<string | null>(null)
  // SSR 与客户端首帧必须一致（默认画册模式），挂载后再读本地偏好，避免 hydration mismatch
  const [viewMode, setViewMode] = useState<AlbumViewMode>('book')

  useEffect(() => {
    try {
      const book = new URLSearchParams(window.location.search).get('book')
      if (book) setInitialBookKey(book)
    } catch {
      // 忽略
    }
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('album-view-mode')
      // 银河模式初始化较重，不做「用户上次选择」恢复，避免再次成为相册默认首页。
      if (saved === 'pixel') setViewMode('pixel')
      else if (saved === 'space') localStorage.removeItem('album-view-mode')
    } catch {
      // 忽略
    }
  }, [])

  const changeMode = useCallback((next: AlbumViewMode) => {
    setViewMode(next)
    try {
      localStorage.setItem('album-view-mode', next)
    } catch {
      // 忽略
    }
  }, [])

  const toggleViewMode = useCallback(() => {
    changeMode(viewMode === 'space' ? 'pixel' : 'space')
  }, [changeMode, viewMode])

  const handleUnlockSuccess = useCallback(() => {
    setShowUnlockModal(false)
    reload()
  }, [reload])

  // 星图点选城市 -> 打开该城市旅行档案
  const handleStarMapSelect = useCallback(
    (city: { name: string }) => {
      const full = cities.find((c) => c.name === city.name)
      if (!full) return
      setSelectedCity(full)
      setShowStarMap(false)
      setShowArchive(true)
    },
    [cities, setSelectedCity],
  )

  const handleWebGLFail = useCallback(() => setViewMode('pixel'), [])

  if (checkingLock) {
    return (
      <div className="min-h-dvh pixel-desk-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-album-accent">
          <div className="w-6 h-6 border-2 border-album-accent/30 border-t-album-accent rounded-full animate-spin" />
          <span className="text-sm tracking-wider text-album-warm">正在翻开相册...</span>
        </div>
      </div>
    )
  }

  // 旅行画册 2.0（Phase 2）：默认「旅行画册」模式，以 Travel 数据驱动，无需相册解锁
  if (viewMode === 'book') {
    return (
      <div key="mode-book" className="motion-safe:animate-[fadeIn_.2s_ease-out]">
        <TravelBook onModeChange={changeMode} initialBookKey={initialBookKey} />
      </div>
    )
  }

  if (!isUnlocked) {
    return (
      <AlbumUnlockScreen
        viewMode={viewMode}
        showUnlockModal={showUnlockModal}
        onOpenUnlock={() => setShowUnlockModal(true)}
        onCloseUnlock={() => setShowUnlockModal(false)}
        onUnlockSuccess={handleUnlockSuccess}
        onSelectPixel={() => changeMode('pixel')}
      />
    )
  }

  // 像素模式：书卷留言整页视图
  if (view === 'chat' && chatPhoto && viewMode === 'pixel') {
    return (
      <PixelPhotoChat
        image={chatPhoto.url}
        imageKey={chatPhoto.key}
        cityName={chatPhoto.cityName}
        date={chatPhoto.date}
        onBack={() => {
          setView('gallery')
          setChatPhoto(null)
        }}
      />
    )
  }

  // 银河模式：360° 全景唱片空间（留言页作为覆盖层叠在上方，返回无需重建场景）
  if (viewMode === 'space') {
    return (
      <AlbumSpaceMode
        cities={cities}
        chatPhoto={chatPhoto}
        view={view}
        onTogglePixel={toggleViewMode}
        onOpenChat={(photo) => {
          setChatPhoto(photo)
          setView('chat')
        }}
        onCloseChat={() => {
          setView('gallery')
          setChatPhoto(null)
        }}
        onWebGLFail={handleWebGLFail}
        onExitMode={() => changeMode('book')}
      />
    )
  }

  return (
    <div className="min-h-dvh album-pixel-root bg-album-bg1 relative overflow-hidden motion-safe:animate-[fadeIn_.2s_ease-out]">
      {/* 像素木屋桌面背景 */}
      <PixelDeskBackground />

      {/* 移动端新建相册入口（原生壳，模块内管理入口；Web 走后台 /admin/albums） */}
      {isNativePlatform() && isUnlocked && (
        <div className="fixed right-3 top-16 z-[120]">
          <AlbumComposer onCreated={refresh} />
        </div>
      )}

      <AlbumHeader
        viewMode={viewMode}
        onSelectMode={changeMode}
        onToggleViewMode={toggleViewMode}
        onOpenStarMap={() => setShowStarMap(true)}
      />

      <div className="relative z-10 pt-4 pb-[max(48px,env(safe-area-inset-bottom))] min-h-dvh md:pb-12">
        {/* 相册封面横幅 */}
        <AlbumCoverBanner cityCount={cities.length} photoCount={totalPhotos} />

        <div className="max-w-6xl mx-auto px-4 grid lg:grid-cols-[280px_1fr] gap-5 items-start">
          {/* 左侧：旅行书架 */}
          <AlbumBookshelf
            cities={cities}
            selectedCity={selectedCity}
            loading={loading}
            onSelectCity={setSelectedCity}
          />

          {/* 右侧：拍立得照片墙 */}
          <main className="min-w-0">
            <AlbumPhotoWall
              city={selectedCity}
              onOpenArchive={() => setShowArchive(true)}
              onOpenViewer={setViewerIndex}
            />
          </main>
        </div>

        {/* 纪念相册：后台 Album 实体（Stage 1.3 合并进前台唯一入口） */}
        {albums.length > 0 && <AlbumGalleryGrid albums={albums} onRefresh={refresh} />}

        {/* 旅行档案视图（Stage 1.4） */}
        {showArchive && selectedCity && (
          <TravelArchiveView
            city={{
              name: selectedCity.name,
              province: selectedCity.province,
              images: selectedCity.images,
              date: formatDotDate(selectedCity.date),
            }}
            onClose={() => setShowArchive(false)}
          />
        )}

        {/* 旅行星图（Stage 1.4） */}
        {showStarMap && (
          <AlbumStarMapOverlay
            cities={starCities}
            stats={{ cities: starCities.length, days: totalDays, photos: totalPhotos }}
            onSelectCity={handleStarMapSelect}
            onClose={() => setShowStarMap(false)}
          />
        )}
        {viewerIndex !== null && selectedCity && (
          <ErrorBoundary label="PhotoMorphViewer">
            <PhotoMorphViewer
              images={selectedCity.images}
              initialIndex={viewerIndex}
              onClose={() => setViewerIndex(null)}
              cityName={selectedCity.name}
              onChat={(url) => {
                setChatPhoto({ url, key: url, cityName: selectedCity.name, date: formatDotDate(selectedCity.date) })
                setView('chat')
              }}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}
