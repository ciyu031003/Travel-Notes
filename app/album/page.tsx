'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamicImport from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'
import AlbumCoverBanner from '@/components/album/AlbumCoverBanner'
import TravelBook from '@/components/album/travel-book/TravelBook'
import AlbumHeader from '@/components/album/AlbumHeader'
import AlbumBookshelf from '@/components/album/AlbumBookshelf'
import AlbumGalleryGrid from '@/components/album/AlbumGalleryGrid'
import AlbumPhotoWall from '@/components/album/AlbumPhotoWall'
import type { AlbumViewMode } from '@/components/album/AlbumModeSwitch'
import type { SpaceChatPhoto } from '@/components/album/AlbumSpaceMode'
import AlbumWallBoot, { AlbumWallError } from '@/components/web/album/AlbumWallBoot'
import { useDesktopViewport } from '@/components/web/album/useDesktopViewport'
import { useAlbumData } from '@/hooks/use-album-data'
import { formatDotDate } from '@/lib/modules/album/presentation'
import { isNativePlatform } from '@/lib/modules/offline/platform'

/**
 * 渲染器加载占位（与页面自身的「正在翻开相册…」骨架同形，避免加载态闪变/高度跳变）
 */
function ModeLoading({ label }: { label: string }) {
  return (
    <div className="m2-screen flex min-h-dvh items-center justify-center bg-[var(--m-bg)]">
      <div className="m2-card flex items-center gap-3 px-5 py-4 text-[13px] font-semibold text-[var(--m-muted)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--m-line-strong)] border-t-[var(--m-accent)]" />
        {label}
      </div>
    </div>
  )
}

/*
 * 非默认模式的渲染器全部按需加载（移动端性能专项 D，2026-11-21）
 * ---------------------------------------------------------------------------
 * 相册默认模式是「旅行画册」（book），像素/银河/档案/星图这些渲染器在首屏**根本不渲染**，
 * 此前却是静态 import：打开相册就要先下载 three 场景、像素桌面、照片聊天、阅读器主题等
 * 一大坨代码。真机反馈「打开相册特别卡」= 首屏 JS 体积 + 主线程编译时间。
 * 现在全部改成 ssr:false 动态导入：首屏只留 book 模式必需件，其余在真正进入该模式时再拉。
 */
// v3.1 M3-D2：Canvas/WebGL 重组件按需加载（首屏不打包；渲染时才拉取）
const PhotoMorphViewer = dynamicImport(() => import('@/components/album/PhotoMorphViewer'), { ssr: false })
// 银河模式（three 场景 + HUD/雷达）
const AlbumSpaceMode = dynamicImport(() => import('@/components/album/AlbumSpaceMode'), {
  ssr: false,
  loading: () => <ModeLoading label="正在进入银河空间…" />,
})
// 像素模式整页视图（像素桌面背景 + 照片聊天）
const PixelDeskBackground = dynamicImport(() => import('@/components/album/PixelDeskBackground'), { ssr: false })
const PixelPhotoChat = dynamicImport(() => import('@/components/album/PixelPhotoChat'), {
  ssr: false,
  loading: () => <ModeLoading label="正在打开照片留言…" />,
})
// 未解锁皮肤（只在像素/银河模式且未解锁时出现）
const AlbumUnlockScreen = dynamicImport(() => import('@/components/album/AlbumUnlockScreen'), {
  ssr: false,
  loading: () => <ModeLoading label="正在检查相册…" />,
})
// 点击后才出现的浮层：加载占位保持 null，避免给已渲染页面插入闪烁元素
const TravelArchiveView = dynamicImport(() => import('@/components/album/TravelArchiveView'), { ssr: false, loading: () => null })
const AlbumStarMapOverlay = dynamicImport(() => import('@/components/album/AlbumStarMapOverlay'), { ssr: false, loading: () => null })
const AlbumComposer = dynamicImport(() => import('@/components/album/AlbumComposer'), { ssr: false, loading: () => null })
// 桌面画册墙（Web W2）：只有 ≥1024 才挂载。代码块 + web-album.css（~40KB）因此全部留在
// 桌面侧，移动端首屏不再为它下载/编译（P1-4）。ssr:false：它在服务端没有可用信息
// （data 全在客户端取），加载期间先显示与画册墙同形的骨架，避免高度跳变。
const WebAlbumWall = dynamicImport(() => import('@/components/web/album/WebAlbumWall'), {
  ssr: false,
  loading: () => <AlbumWallBoot />,
})


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
  // SSR 与客户端首帧必须一致（默认画册模式），挂载后再读本地偏好，避免 hydration mismatch
  const [viewMode, setViewMode] = useState<AlbumViewMode>('book')
  /** 桌面视口（≥1024px）：决定相册页渲染 Web 版画册墙还是原有移动端旅行画册 */
  const isDesktop = useDesktopViewport()
  // 性能（2026-11-21）：默认的 book 模式不需要相册解锁数据，首屏就不请求 /api/album，
  // 只有真正切到像素/银河模式时才拉 —— 打开相册少一次接口往返。
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
  } = useAlbumData({ enabled: viewMode !== 'book' })

  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [showStarMap, setShowStarMap] = useState(false)
  const [chatPhoto, setChatPhoto] = useState<SpaceChatPhoto | null>(null)
  const [view, setView] = useState<'gallery' | 'chat'>('gallery')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  // 深链直达：/album?book=<bookKey>（首页画册目录 → 直开某城市画册）
  const [initialBookKey, setInitialBookKey] = useState<string | null>(null)
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

  // 旅行画册 2.0（Phase 2）：默认「旅行画册」模式，以 Travel 数据驱动，无需相册解锁。
  // 性能（2026-11-21）：book 模式的数据来自 TravelBook 自己的 /api/travel-book，
  // **不依赖** useAlbumData 的 /api/album。因此把它提到 checkingLock 之前渲染 —— 打开相册
  // 不再被另一个接口的往返阻塞（此前每次进 /album 都要等 /api/album 才出第一屏）。
  if (viewMode === 'book') {
    // Web 相册（桌面专属，W2）：≥1024px 走 3D 卡片画册墙，<1024 保持原有移动端旅行画册。
    //
    // 首帧契约（P0 修复）：
    //  · isDesktop === null（SSR / 水合首帧，matchMedia 还没有值）→ 只渲染中性骨架。
    //    这一帧**不能**再押某一侧：押移动端要靠 .wa-hide-on-desktop 藏起来，而那个类
    //    只在 @media (min-width:1024px) 里 display:none —— 桌面首帧就是整页空白
    //    （禁用 JS 时永久空白）。骨架是纯 CSS、不依赖断点，任何宽度都有东西可看。
    //  · wa-hide-on-desktop 只在确定是移动端时加（防御：真跑在 <1024 时不留残影）；
    //    桌面分支外面包 ErrorBoundary —— 画册墙渲染期抛错只降级成一块提示，
    //    不会把整页卸载成白屏（与页面里其它重渲染器的约定一致）。
    if (isDesktop === null) {
      return <AlbumWallBoot key="mode-book-boot" />
    }

    if (isDesktop) {
      return (
        <div key="mode-book-web" className="wa-hide-on-mobile">
          <ErrorBoundary label="WebAlbumWall" fallback={<AlbumWallError />}>
            <WebAlbumWall onModeChange={changeMode} initialBookKey={initialBookKey} />
          </ErrorBoundary>
        </div>
      )
    }

    return (
      <div key="mode-book" className="wa-hide-on-desktop motion-safe:animate-[fadeIn_.2s_ease-out]">
        <TravelBook onModeChange={changeMode} initialBookKey={initialBookKey} />
      </div>
    )
  }

  // 非 book 模式才需要相册解锁状态：此时再等 checkingLock
  if (checkingLock) {
    return <ModeLoading label="正在翻开相册…" />
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