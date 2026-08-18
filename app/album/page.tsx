'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Lock, MapPin, Sparkles, Rocket, Orbit } from 'lucide-react'
import PixelDeskBackground from '@/components/album/PixelDeskBackground'
import PolaroidWall from '@/components/album/PolaroidWall'
import TravelFilmCard from '@/components/album/TravelFilmCard'
import TravelArchiveView from '@/components/album/TravelArchiveView'
import TravelStarMap from '@/components/album/TravelStarMap'
import TravelLocationBadge from '@/components/album/TravelLocationBadge'
import TravelTimeline from '@/components/album/TravelTimeline'
import { findCityByName } from '@/data/cities'
import PixelPhotoChat from '@/components/album/PixelPhotoChat'
import PixelUnlockModal from '@/components/album/PixelUnlockModal'
import PhotoChatView from '@/components/album/PhotoChatView'
import GalaxyAlbumScene from '@/components/album/space/GalaxyAlbumScene'
import SpaceUnlockModal from '@/components/album/space/SpaceUnlockModal'

interface CityDay {
  date: string
  title: string
  images: string[]
}

interface CityAlbum {
  name: string
  province: string
  provinceId: string
  images: string[]
  date: string
  postSlug: string
  days: CityDay[]
}

interface AlbumItem {
  id: number
  title: string
  description: string | null
  coverUrl: string | null
  mediaCount: number
  date: string | null
  createdAt: string
}

interface ChatPhoto {
  url: string
  key: string
  cityName: string
  date: string
}

// 书脊配色（循环使用）
const SPINE_COLORS = [
  'book-spine-red',
  'book-spine-blue',
  'book-spine-green',
  'book-spine-purple',
  'book-spine-brown',
  'book-spine-leather',
]

const VIEW_MODE_KEY = 'album-view-mode'

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}

export default function AlbumPage() {
  const router = useRouter()
  const [cities, setCities] = useState<CityAlbum[]>([])
  const [albums, setAlbums] = useState<AlbumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCity, setSelectedCity] = useState<CityAlbum | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [checkingLock, setCheckingLock] = useState(true)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [showStarMap, setShowStarMap] = useState(false)
  const [chatPhoto, setChatPhoto] = useState<ChatPhoto | null>(null)
  const [view, setView] = useState<'gallery' | 'chat'>('gallery')
  const [viewMode, setViewMode] = useState<'space' | 'pixel'>(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === 'pixel' ? 'pixel' : 'space'
    } catch {
      return 'space'
    }
  })

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === 'space' ? 'pixel' : 'space'
      try {
        localStorage.setItem(VIEW_MODE_KEY, next)
      } catch {
        // 忽略
      }
      return next
    })
  }, [])

  const loadAlbumData = async () => {
    try {
      const res = await fetch('/api/album')
      if (res.ok) {
        const data = await res.json()
        setIsUnlocked(true)
        setCities(data.cities || [])
        setAlbums(data.albums || [])
        if (data.cities && data.cities.length > 0) {
          setSelectedCity(data.cities[0])
        }
      } else {
        setIsUnlocked(false)
      }
    } catch {
      setIsUnlocked(false)
    } finally {
      setCheckingLock(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlbumData()
  }, [])

  const handleUnlockSuccess = () => {
    setShowUnlockModal(false)
    setLoading(true)
    loadAlbumData()
  }

  const handleWebGLFail = useCallback(() => {
    setViewMode('pixel')
  }, [])

  const totalPhotos = cities.reduce((sum, city) => sum + city.images.length, 0)
  const totalDays = cities.reduce((sum, city) => sum + (city.days?.length || 1), 0)
  const starCities = cities
    .map((city) => {
      const match = findCityByName(city.name)
      if (!match) return null
      return {
        name: city.name,
        lat: match.lat,
        lng: match.lng,
        date: formatDate(city.date),
        count: city.images.length,
      }
    })
    .filter(Boolean) as { name: string; lat: number; lng: number; date: string; count: number }[]

  if (checkingLock) {
    return (
      <div className="min-h-screen pixel-desk-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-album-accent">
          <div className="w-6 h-6 border-2 border-album-accent/30 border-t-album-accent rounded-full animate-spin" />
          <span className="text-sm tracking-wider text-album-warm">正在翻开相册...</span>
        </div>
      </div>
    )
  }

  if (!isUnlocked) {
    if (viewMode === 'space') {
      return (
        <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-album-bg0">
          {/* 星空氛围底（纯 CSS 星点，避免未解锁时启动 WebGL） */}
          <div className="absolute inset-0 opacity-70" aria-hidden="true">
            {Array.from({ length: 60 }, (_, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${(i * 37) % 100}%`,
                  top: `${(i * 53) % 100}%`,
                  width: i % 5 === 0 ? 2.5 : 1.5,
                  height: i % 5 === 0 ? 2.5 : 1.5,
                  opacity: 0.25 + (i % 4) * 0.18,
                  animation: `space-twinkle ${2 + (i % 5)}s ease-in-out infinite`,
                  animationDelay: `${(i % 7) * 0.4}s`,
                }}
              />
            ))}
          </div>

          <div className="relative z-10 w-full max-w-md space-glass rounded-3xl p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-album-bg0/70 border border-white/15 flex items-center justify-center shadow-[0_0_40px_var(--album-accent-dim)]">
              <Lock className="w-8 h-8 text-album-accent" />
            </div>
            <h2 className="text-album-text1 text-2xl font-bold tracking-[0.3em]">旅行相册 · 银河存档</h2>
            <p className="text-album-text2 text-xs mt-3 leading-relaxed">
              这是我们的秘密相册
              <br />
              输入恋爱纪念日，唤醒银河中的回忆
            </p>
            <button
              type="button"
              onClick={() => setShowUnlockModal(true)}
              className="mt-6 w-full space-glass-btn rounded-full !py-3 text-sm font-bold text-album-text1"
            >
              解锁相册
            </button>
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="space-glass-btn rounded-full px-4 py-2 text-xs text-album-text2"
              >
                返回首页
              </button>
              <button
                type="button"
                onClick={toggleViewMode}
                className="space-glass-btn rounded-full px-4 py-2 text-xs text-album-text2 flex items-center gap-1.5"
              >
                <Rocket className="w-3.5 h-3.5" />
                切到像素风
              </button>
            </div>
          </div>

          <SpaceUnlockModal
            isOpen={showUnlockModal}
            onClose={() => setShowUnlockModal(false)}
            onSuccess={handleUnlockSuccess}
          />
        </div>
      )
    }

    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-album-bg1">
        <PixelDeskBackground />
        <div className="relative z-10 w-full max-w-md pixel-book-container rounded-sm p-8 text-center">
          <div className="pixel-corner-gold-tl" />
          <div className="pixel-corner-gold-tr" />
          <div className="pixel-corner-gold-bl" />
          <div className="pixel-corner-gold-br" />

          <div className="book-cover-3d w-28 h-36 mx-auto mb-6 flex flex-col items-center justify-center gap-2 rounded-sm">
            <Lock className="w-8 h-8 text-album-accent" />
            <span className="text-xs text-album-warm font-bold">相册已上锁</span>
          </div>
          <h2 className="font-zpix text-2xl font-bold text-album-accent tracking-wider drop-shadow-[0_4px_0_rgba(0,0,0,0.7)]">
            旅行相册 · 存档
          </h2>
          <p className="text-xs text-album-warm mt-3 leading-relaxed">
            这是我们的秘密相册
            <br />
            输入恋爱纪念日即可解锁
          </p>
          <button
            type="button"
            onClick={() => setShowUnlockModal(true)}
            className="mt-6 w-full mc-button mc-button-gold !py-2.5 text-xs font-bold"
          >
            解锁相册
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-3 w-full mc-button mc-button-parchment !py-2 text-xs font-bold"
          >
            返回首页
          </button>
        </div>

        <PixelUnlockModal
          isOpen={showUnlockModal}
          onClose={() => setShowUnlockModal(false)}
          onSuccess={handleUnlockSuccess}
        />
      </div>
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
      <>
        <GalaxyAlbumScene
          cities={cities}
          onTogglePixel={toggleViewMode}
          onOpenChat={(photo) => {
            setChatPhoto(photo)
            setView('chat')
          }}
          onWebGLFail={handleWebGLFail}
        />
        {view === 'chat' && chatPhoto && (
          <PhotoChatView
            image={chatPhoto.url}
            imageKey={chatPhoto.key}
            cityName={chatPhoto.cityName}
            onBack={() => {
              setView('gallery')
              setChatPhoto(null)
            }}
          />
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen album-pixel-root bg-album-bg1 relative overflow-hidden">
      {/* 像素木屋桌面背景 */}
      <PixelDeskBackground />

      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 md:px-8 border-b-4 border-black bg-black/45">
        <Link
          href="/login"
          className="pixel-btn pixel-border-stone px-3 py-1.5 text-xs font-bold rounded-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回登录
        </Link>
        <div className="font-zpix text-album-accent text-sm font-bold tracking-widest drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)] flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          我们的旅行相册 · 存档
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowStarMap(true)}
            className="pixel-btn pixel-border-gold px-3 py-1.5 text-xs font-bold rounded-sm flex items-center gap-1.5"
            title="查看旅行星图"
          >
            <Orbit className="w-3.5 h-3.5" />
            星图
          </button>
          <button
            type="button"
            onClick={toggleViewMode}
            className="pixel-btn pixel-border-gold px-3 py-1.5 text-xs font-bold rounded-sm flex items-center gap-1.5"
            title="一键切换到银河唱片空间"
          >
            <Rocket className="w-3.5 h-3.5" />
            银河风
          </button>
          <Link
            href="/"
            className="pixel-btn pixel-border-gold px-3 py-1.5 text-xs font-bold rounded-sm"
          >
            进入地图
          </Link>
        </div>
      </header>

      <div className="relative z-10 pt-4 pb-12 min-h-screen">
        {/* 相册封面横幅 */}
        <div className="max-w-6xl mx-auto px-4 mb-5">
          <div className="book-cover-3d relative rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="pixel-corner-gold-tl" />
            <div className="pixel-corner-gold-tr" />
            <div className="pixel-corner-gold-bl" />
            <div className="pixel-corner-gold-br" />

            <div className="flex items-center gap-4">
              <div className="item-frame w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center hidden sm:flex">
                <BookOpen className="w-7 h-7 text-album-accent" />
              </div>
              <div>
                <h1 className="font-zpix text-xl sm:text-2xl font-bold text-album-accent tracking-wider drop-shadow-[0_3px_0_rgba(0,0,0,0.7)]">
                  我们的旅行相册
                </h1>
                <p className="text-xs text-album-warm mt-1 tracking-widest">
                  TRAVEL ALBUM · SAVE OUR MEMORIES
                </p>
              </div>
            </div>

            <div className="text-right hidden sm:block select-none">
              <p className="text-xs text-album-accent font-bold">{cities.length} 座城市 · {totalPhotos} 张照片</p>
              <p className="text-xs text-album-warm mt-1">点击照片，留下你的留言</p>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 grid lg:grid-cols-[280px_1fr] gap-5 items-start">
          {/* 左侧：旅行书架 */}
          <aside className="lg:sticky lg:top-[72px] self-start w-full">
            <div className="pixel-book-container rounded-sm overflow-hidden">
              <div className="p-4 border-b-4 border-black/70 bg-pixel-panel3">
                <div className="flex items-center justify-between">
                  <h2 className="font-zpix text-sm font-bold text-album-accent tracking-wider flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    旅行书架
                  </h2>
                  <span className="text-xs text-album-warm font-bold">{cities.length} 册</span>
                </div>
              </div>

              <div className="p-4 bg-pixel-panel2">
                {loading ? (
                  <div className="text-album-warm text-xs py-6 text-center tracking-wider">装载中...</div>
                ) : cities.length === 0 ? (
                  <div className="text-album-warm text-xs py-6 text-center tracking-wider">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    还没有旅行记录
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                      {cities.map((city, index) => {
                        const selected = selectedCity?.name === city.name
                        const spineColor = SPINE_COLORS[index % SPINE_COLORS.length]
                        return (
                          <button
                            key={city.name}
                            type="button"
                            onClick={() => setSelectedCity(city)}
                            title={`${city.name} · ${city.images.length} 张照片 · ${formatDate(city.date)}`}
                            className={`relative w-12 h-32 flex flex-col items-center justify-between py-2 text-white transition-all duration-200 hover:-translate-y-1.5 group shadow-[3px_6px_8px_rgba(0,0,0,0.6)] ${spineColor} ${
                              selected ? '-translate-y-1.5' : ''
                            }`}
                          >
                            {selected && (
                              <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-1.5 h-4 bg-album-accent border border-black rounded-b-sm z-20 shadow-[1px_1px_2px_rgba(0,0,0,0.4)]" />
                            )}
                            <span className="w-full h-1 bg-album-accent/20 opacity-50" />
                            <span className="text-[10px] text-album-accent font-bold">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="[writing-mode:vertical-rl] text-[11px] font-bold tracking-wide text-album-text1 max-h-16 overflow-hidden">
                              {city.name.slice(0, 5)}
                            </span>
                            <span className="text-[10px] text-album-text2">{city.images.length}张</span>
                            <span className="w-full h-1 bg-album-accent/20 opacity-50" />
                          </button>
                        )
                      })}
                    </div>
                    <div className="wood-shelf w-full h-4 mt-4" />
                  </>
                )}
              </div>

              <div className="p-3 border-t border-pixel-ink bg-pixel-panel text-xs text-album-warm text-center leading-relaxed">
                每一本相册收录一座城市的回忆，
                <br />
                点击照片即可在书中留言
              </div>
            </div>
          </aside>

          {/* 右侧：拍立得照片墙 */}
          <main className="min-w-0">
            {selectedCity ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3 select-none">
                  <div className="flex items-center gap-2">
                    <h2 className="font-zpix text-lg font-bold text-album-accent tracking-wide drop-shadow-[2px_2px_0_rgba(0,0,0,0.7)]">
                      {selectedCity.name} · 拍立得记忆
                    </h2>
                    <span className="text-xs text-album-warm font-bold bg-black/40 border border-pixel-line px-2 py-0.5">
                      {selectedCity.images.length} 张
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowArchive(true)}
                    className="pixel-btn pixel-border-gold px-2.5 py-1 text-xs font-bold rounded-sm flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    档案
                  </button>
                  <p className="text-xs text-album-warm flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-album-accent" />
                    {formatDate(selectedCity.date)} · 点击照片开启留言
                  </p>
                </div>

                {/* 旅行档案：地点/日期/DAY 节点（Stage 1.4） */}
                <div className="rounded-lg border border-pixel-line bg-pixel-panel2 p-3 mb-3">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <TravelLocationBadge location={selectedCity.province ? `${selectedCity.province} · ${selectedCity.name}` : selectedCity.name} />
                    <span className="font-zpix text-xs text-album-accent">{formatDate(selectedCity.date)}</span>
                    <span className="font-zpix text-xs text-album-text2">{selectedCity.images.length} 张</span>
                  </div>
                  <TravelTimeline
                    items={[
                      {
                        label: formatDate(selectedCity.date),
                        title: selectedCity.name,
                        subtitle: `${selectedCity.images.length} 张照片 · 点击照片开启留言`,
                      },
                    ]}
                  />
                </div>

                <div className="lg:h-[calc(100vh-230px)] min-h-[420px]">
                  <PolaroidWall
                    images={selectedCity.images}
                    cityName={selectedCity.name}
                    date={formatDate(selectedCity.date)}
                    onPhotoClick={(index) => {
                      const url = selectedCity.images[index]
                      setChatPhoto({
                        url,
                        key: url,
                        cityName: selectedCity.name,
                        date: formatDate(selectedCity.date),
                      })
                      setView('chat')
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[420px] text-album-warm gap-3">
                <div className="item-frame w-20 h-20 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-album-accent opacity-60" />
                </div>
                <p className="text-sm font-bold tracking-wider">从书架选择一本相册</p>
                <p className="text-xs text-album-warm">点亮属于你们的旅行记忆</p>
              </div>
            )}
          </main>
        </div>

        {/* 纪念相册：后台 Album 实体（Stage 1.3 合并进前台唯一入口） */}
        {albums.length > 0 && (
          <section className="max-w-6xl mx-auto px-4 mt-8">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-album-accent" />
              <h2 className="font-zpix text-lg font-bold text-album-accent tracking-wide drop-shadow-[2px_2px_0_rgba(0,0,0,0.7)]">
                纪念相册
              </h2>
              <span className="text-xs text-album-warm font-bold bg-black/40 border border-pixel-line px-2 py-0.5">
                {albums.length} 册
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {albums.map((album) => (
                <TravelFilmCard
                  key={album.id}
                  coverUrl={album.coverUrl ?? undefined}
                  title={album.title}
                  dateRange={album.date ? formatDate(album.date) : undefined}
                  photoCount={album.mediaCount}
                />
              ))}
            </div>
          </section>
        )}

        {/* 旅行档案视图（Stage 1.4） */}
        {showArchive && selectedCity && (
          <TravelArchiveView
            city={{
              name: selectedCity.name,
              province: selectedCity.province,
              images: selectedCity.images,
              date: formatDate(selectedCity.date),
            }}
            onClose={() => setShowArchive(false)}
          />
        )}

        {/* 旅行星图（Stage 1.4） */}
        {showStarMap && (
          <div className="fixed inset-0 z-[110] overflow-y-auto bg-album-bg0">
            <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-black/40 px-4 backdrop-blur-md">
              <span className="font-zpix text-sm font-bold tracking-widest text-album-accent">旅行星图</span>
              <button
                type="button"
                onClick={() => setShowStarMap(false)}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-album-text1"
              >
                关闭
              </button>
            </div>
            <main className="mx-auto w-full max-w-3xl px-4 py-5">
              <TravelStarMap cities={starCities} stats={{ cities: starCities.length, days: totalDays, photos: totalPhotos }} />
            </main>
          </div>
        )}
      </div>
    </div>
  )
}














