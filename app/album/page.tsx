'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Image as ImageIcon, Calendar, Sparkles, Heart, X, Lock } from 'lucide-react'
import AlbumUnlockModal from '@/components/AlbumUnlockModal'
import AlbumLightbox from '@/components/album/AlbumLightbox'

interface CityAlbum {
  name: string
  province: string
  provinceId: string
  images: string[]
  date: string
  postSlug: string
}

function ParallaxImage({
  src,
  alt,
  maxOffset = 10,
  className = '',
}: {
  src: string
  alt: string
  maxOffset?: number
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [imgError, setImgError] = useState(false)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      setOffset({ x: x * maxOffset, y: y * maxOffset })
    },
    [maxOffset]
  )

  const handleMouseLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 })
  }, [])

  if (imgError) {
    return (
      <div className={`${className} flex items-center justify-center bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0]`}>
        <ImageIcon className="w-8 h-8 text-[#8B7355]/40" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`${className} overflow-hidden`}
    >
      <div
        className="w-full h-full transition-transform duration-300 ease-out"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(1.05)` }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          draggable={false}
          onError={() => setImgError(true)}
        />
      </div>

    </div>
  )
}

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
  const [loading, setLoading] = useState(true)
  const [selectedCity, setSelectedCity] = useState<CityAlbum | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [checkingLock, setCheckingLock] = useState(true)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(-1)

  const loadAlbumData = async () => {
    try {
      const res = await fetch('/api/album')
      if (res.ok) {
        const data = await res.json()
        setIsUnlocked(true)
        setCities(data.cities || [])
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

  const getCityGradient = (provinceId: string) => {
    const gradients: Record<string, string> = {
      beijing: 'from-rose-400 to-pink-500',
      shanghai: 'from-blue-400 to-indigo-500',
      guangdong: 'from-amber-400 to-orange-500',
      zhejiang: 'from-pink-400 to-rose-500',
      jiangsu: 'from-green-400 to-emerald-500',
      sichuan: 'from-teal-400 to-cyan-500',
      yunnan: 'from-purple-400 to-violet-500',
      xizang: 'from-yellow-400 to-amber-500',
      xinjiang: 'from-lime-400 to-green-500',
      shandong: 'from-orange-400 to-red-500',
      fujian: 'from-cyan-400 to-blue-500',
      hunan: 'from-emerald-400 to-teal-500',
      hubei: 'from-sky-400 to-blue-500',
      anhui: 'from-indigo-400 to-purple-500',
      henan: 'from-amber-400 to-yellow-500',
      shaanxi: 'from-stone-400 to-amber-500',
      gansu: 'from-yellow-400 to-orange-500',
      qinghai: 'from-cyan-400 to-teal-500',
      heilongjiang: 'from-blue-400 to-cyan-500',
      jilin: 'from-indigo-400 to-blue-500',
      liaoning: 'from-teal-400 to-emerald-500',
      neimenggu: 'from-green-400 to-lime-500',
      ningxia: 'from-stone-400 to-amber-500',
      hainan: 'from-cyan-400 to-blue-500',
      guangxi: 'from-emerald-400 to-green-500',
      guizhou: 'from-lime-400 to-green-500',
      chongqing: 'from-rose-400 to-red-500',
      jiangxi: 'from-orange-400 to-rose-500',
      hongkong: 'from-violet-400 to-purple-500',
      macau: 'from-amber-400 to-rose-500',
      taiwan: 'from-sky-400 to-indigo-500',
      tianjin: 'from-blue-400 to-teal-500',
      hebei: 'from-emerald-400 to-cyan-500',
      shanxi: 'from-stone-400 to-yellow-500',
    }
    return gradients[provinceId] || 'from-slate-400 to-gray-500'
  }

  const getCityEmoji = (provinceId: string) => {
    const emojis: Record<string, string> = {
      beijing: '🏯', shanghai: '🌃', guangdong: '🏙️', zhejiang: '🏞️',
      jiangsu: '🏮', sichuan: '🐼', yunnan: '🏔️', xizang: '🏛️',
      xinjiang: '🌄', shandong: '⛰️', fujian: '🏝️', hunan: '🌉',
      hubei: '🚣', anhui: '🏔️', henan: '🏛️', shaanxi: '⚔️',
      gansu: '🏜️', qinghai: '🏞️', heilongjiang: '❄️', jilin: '🌲',
      liaoning: '🌊', neimenggu: '🐎', ningxia: '🏜️', hainan: '🏖️',
      guangxi: '🚣', guizhou: '💦', chongqing: '🌉', jiangxi: '🌾',
      hongkong: '🏙️', macau: '🎰', taiwan: '🏝️', tianjin: '🌉',
      hebei: '🏯', shanxi: '🏯',
    }
    return emojis[provinceId] || '📍'
  }

  if (checkingLock) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FAF6F2] via-[#F5EDE4] to-[#E8DDD4] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#E8B8C2]/30 border-t-[#E8B8C2] rounded-full animate-spin" />
        <span className="ml-3 text-[#8B7355]/60 text-sm">验证中...</span>
      </div>
    )
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FAF6F2] via-[#F5EDE4] to-[#E8DDD4] relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#F5DCE0]/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-[#D6E8F0]/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 w-full max-w-sm bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/80 p-8 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[#5A4A3A]">相册已上锁</h2>
          <p className="text-sm text-[#8B7355]/70 mt-3 leading-relaxed">
            这是我们的秘密相册<br />请输入恋爱纪念日解锁
          </p>
          <button
            type="button"
            onClick={() => setShowUnlockModal(true)}
            className="mt-6 w-full py-3 bg-gradient-to-r from-[#E8B8C2] to-[#D4A5B0] text-white font-semibold rounded-2xl hover:from-[#D8A8B2] hover:to-[#C495A0] transition-all shadow-lg shadow-[#E8B8C2]/30 flex items-center justify-center gap-2"
          >
            解锁相册
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-3 w-full py-2.5 bg-white/60 hover:bg-white border border-[#E8DDD4] text-[#8B7355]/70 rounded-2xl hover:text-[#5A4A3A] transition-all text-sm flex items-center justify-center gap-1.5"
          >
            返回首页
          </button>
        </div>

        {/* 解锁弹窗 */}
        <AlbumUnlockModal
          isOpen={showUnlockModal}
          onClose={() => setShowUnlockModal(false)}
          onSuccess={handleUnlockSuccess}
          redirectToAlbum={false}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F2] via-[#F5EDE4] to-[#E8DDD4] relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#F5DCE0]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-[#D6E8F0]/20 rounded-full blur-3xl" />
      </div>

      {/* 顶部导航 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-[#E8DDD4]">
        <nav className="w-full mx-auto h-14 flex items-center justify-between px-4 md:px-8">
          <Link
            href="/login"
            className="flex items-center gap-2 text-[#8B7355]/70 hover:text-[#5A4A3A] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">返回登录</span>
          </Link>

          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#E8B8C2]" />
            <span className="font-bold text-[#5A4A3A]">我们的相册</span>
          </div>

          <Link
            href="/"
            className="px-4 py-2 text-sm bg-[#5A4A3A] text-[#FAF6F2] rounded-xl hover:bg-[#4A3A2A] transition-colors"
          >
            进入地图
          </Link>
        </nav>
      </header>

      {/* 主要内容 */}
      <div className="relative z-10 pt-14 min-h-screen">
        <div className="grid lg:grid-cols-[320px_1fr] min-h-[calc(100vh-56px)]">
          {/* 左侧城市列表 */}
          <div className="border-r border-[#E8DDD4] bg-white/40 backdrop-blur-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#5A4A3A] flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#E8B8C2]" />
                  点亮的城市
                </h2>
                <span className="text-xs text-[#8B7355]/50 bg-white/60 px-2 py-1 rounded-full">
                  {cities.length} 座
                </span>
              </div>

              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 scrollbar-thin">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-[#8B7355]/50 text-sm">
                    <div className="w-5 h-5 border-2 border-[#E8B8C2]/30 border-t-[#E8B8C2] rounded-full animate-spin mr-2" />
                    加载中...
                  </div>
                ) : cities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[#8B7355]/50 text-sm">
                    <ImageIcon className="w-10 h-10 mb-3 opacity-40" />
                    <p>还没有旅行记录</p>
                  </div>
                ) : (
                  cities.map((city) => (
                    <button
                      key={city.name}
                      onClick={() => {
                        setSelectedCity(city)
                        setSelectedImageIndex(0)
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group ${
                        selectedCity?.name === city.name
                          ? 'bg-[#E8B8C2]/20 border border-[#E8B8C2]/40 shadow-sm'
                          : 'hover:bg-white/60 border border-transparent hover:border-[#E8DDD4]'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getCityGradient(
                          city.provinceId
                        )} flex items-center justify-center text-lg shadow-sm flex-shrink-0`}
                      >
                        {getCityEmoji(city.provinceId)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#5A4A3A] text-sm truncate">
                            {city.name}
                          </span>
                          {city.province && (
                            <span className="text-[10px] text-[#8B7355]/50 bg-white/50 px-1.5 py-0.5 rounded-full">
                              {city.province}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-[#8B7355]/50 flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {formatDate(city.date)}
                          </span>
                          <span className="text-[11px] text-[#8B7355]/50">
                            · {city.images.length} 张
                          </span>
                        </div>
                      </div>
                      <Heart
                        className={`w-4 h-4 flex-shrink-0 transition-all ${
                          selectedCity?.name === city.name
                            ? 'text-[#E8B8C2] fill-[#E8B8C2]'
                            : 'text-[#8B7355]/20 group-hover:text-[#E8B8C2]/50'
                        }`}
                      />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 右侧图片区域 */}
          <div className="p-6 md:p-8">
            {selectedCity ? (
              <div>
                {/* 城市信息头部 */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getCityGradient(
                          selectedCity.provinceId
                        )} flex items-center justify-center text-xl shadow-md`}
                      >
                        {getCityEmoji(selectedCity.provinceId)}
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold text-[#5A4A3A]">
                          {selectedCity.name}
                        </h1>
                        <p className="text-sm text-[#8B7355]/60">
                          {selectedCity.province} · {formatDate(selectedCity.date)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/travel/${selectedCity.postSlug}`}
                    className="px-4 py-2 bg-white/60 hover:bg-white border border-[#E8DDD4] rounded-xl text-sm text-[#5A4A3A] transition-all hover:shadow-sm flex items-center gap-1.5"
                  >
                    查看游记
                    <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                  </Link>
                </div>

                {/* 主图片展示 */}
                {selectedCity.images.length > 0 && (
                  <div className="mb-6">
                    <div
                      className="relative rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-[#F5DCE0] to-[#D6E8F0] cursor-zoom-in group"
                      onClick={() => setLightboxIndex(selectedImageIndex)}
                    >
                      <ParallaxImage
                        src={selectedCity.images[selectedImageIndex]}
                        alt={`${selectedCity.name} - 主图`}
                        maxOffset={8}
                        className="w-full aspect-[16/9]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1.5 bg-white/80 backdrop-blur rounded-full">
                            <span className="text-xs font-medium text-[#5A4A3A]">
                              {selectedImageIndex + 1} / {selectedCity.images.length}
                            </span>
                          </div>
                        </div>
                        <div className="px-3 py-1.5 bg-[#E8B8C2]/80 backdrop-blur rounded-full">
                          <span className="text-xs font-medium text-white">
                            {selectedCity.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 瀑布流图片网格（点击打开灯箱） */}
                <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
                  {selectedCity.images.map((img, i) => (
                    <button
                      key={`${img}-${i}`}
                      type="button"
                      onClick={() => {
                        setSelectedImageIndex(i)
                        setLightboxIndex(i)
                      }}
                      className={`relative block w-full mb-4 rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-lg group break-inside-avoid ${
                        i === selectedImageIndex ? 'ring-2 ring-[#E8B8C2] ring-offset-2' : ''
                      }`}
                    >
                      <img
                        src={img}
                        alt={`${selectedCity.name} ${i + 1}`}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-white/70 backdrop-blur rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-medium text-[#5A4A3A]">{i + 1}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-[#8B7355]/50">
                <MapPin className="w-12 h-12 mb-3 opacity-30" />
                <p>选择一座城市查看相册</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxIndex >= 0 && selectedCity && (
        <AlbumLightbox
          images={selectedCity.images}
          initialIndex={lightboxIndex}
          cityName={selectedCity.name}
          onClose={() => setLightboxIndex(-1)}
        />
      )}
    </div>
  )
}



