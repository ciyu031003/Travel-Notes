'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Image as ImageIcon, Calendar, Sparkles, Lock, Star } from 'lucide-react'
import AlbumUnlockModal from '@/components/AlbumUnlockModal'
import StarfieldBackground from '@/components/album/StarfieldBackground'
import PhotoRiver from '@/components/album/PhotoRiver'
import PhotoChatView from '@/components/album/PhotoChatView'

interface CityAlbum {
  name: string
  province: string
  provinceId: string
  images: string[]
  date: string
  postSlug: string
}

interface ChatPhoto {
  url: string
  key: string
  cityName: string
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
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [checkingLock, setCheckingLock] = useState(true)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [chatPhoto, setChatPhoto] = useState<ChatPhoto | null>(null)
  const [view, setView] = useState<'gallery' | 'chat'>('gallery')

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
      <div className="min-h-screen bg-[#05060f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-300/20 border-t-indigo-300 rounded-full animate-spin" />
        <span className="ml-3 text-indigo-200/60 text-sm">穿越星河中...</span>
      </div>
    )
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#05060f] relative overflow-hidden flex items-center justify-center p-4">
        <StarfieldBackground />
        <div className="relative z-10 w-full max-w-sm bg-white/[0.06] backdrop-blur-xl rounded-3xl border border-white/10 p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500/60 to-purple-600/60 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg border border-white/10">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">相册已上锁</h2>
          <p className="text-sm text-white/50 mt-3 leading-relaxed">
            这是我们的秘密相册<br />请输入恋爱纪念日解锁
          </p>
          <button
            type="button"
            onClick={() => setShowUnlockModal(true)}
            className="mt-6 w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-2xl hover:from-indigo-400 hover:to-purple-400 transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
          >
            解锁相册
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-3 w-full py-2.5 bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded-2xl transition-all text-sm flex items-center justify-center gap-1.5"
          >
            返回首页
          </button>
        </div>

        <AlbumUnlockModal
          isOpen={showUnlockModal}
          onClose={() => setShowUnlockModal(false)}
          onSuccess={handleUnlockSuccess}
          redirectToAlbum={false}
        />
      </div>
    )
  }

  // 整页状态切换：聊天视图（粒子化照片背景 + 微信聊天 UI，卸载画廊以节省性能）
  if (view === 'chat' && chatPhoto) {
    return (
      <PhotoChatView
        image={chatPhoto.url}
        imageKey={chatPhoto.key}
        cityName={chatPhoto.cityName}
        onBack={() => {
          setView('gallery')
          setChatPhoto(null)
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#05060f] relative overflow-hidden">
      {/* 深邃动态星空背景 */}
      <StarfieldBackground />

      {/* 顶部导航 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/30 backdrop-blur-md border-b border-white/10">
        <nav className="w-full mx-auto h-14 flex items-center justify-between px-4 md:px-8">
          <Link
            href="/login"
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">返回登录</span>
          </Link>

          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-300" />
            <span className="font-bold text-white/90">我们的相册 · 星河</span>
          </div>

          <Link
            href="/"
            className="px-4 py-2 text-sm bg-white/10 text-white/90 rounded-xl hover:bg-white/20 border border-white/10 transition-colors"
          >
            进入地图
          </Link>
        </nav>
      </header>

      <div className="relative z-10 pt-14 min-h-screen">
        <div className="grid lg:grid-cols-[320px_1fr] min-h-[calc(100vh-56px)]">
          {/* 左侧：点亮的城市列表（保留卡片样式） */}
          <div className="border-r border-white/10 bg-black/25 backdrop-blur-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white/90 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-indigo-300" />
                  点亮的城市
                </h2>
                <span className="text-xs text-white/40 bg-white/10 px-2 py-1 rounded-full">
                  {cities.length} 座
                </span>
              </div>

              <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-2 scrollbar-thin">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-white/40 text-sm">
                    <div className="w-5 h-5 border-2 border-indigo-300/20 border-t-indigo-300 rounded-full animate-spin mr-2" />
                    加载中...
                  </div>
                ) : cities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-white/40 text-sm">
                    <ImageIcon className="w-10 h-10 mb-3 opacity-40" />
                    <p>还没有旅行记录</p>
                  </div>
                ) : (
                  cities.map((city) => (
                    <button
                      key={city.name}
                      onClick={() => setSelectedCity(city)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group ${
                        selectedCity?.name === city.name
                          ? 'bg-white/15 border border-indigo-300/40 shadow-lg shadow-indigo-500/10'
                          : 'hover:bg-white/10 border border-transparent hover:border-white/15'
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
                          <span className="font-semibold text-white/90 text-sm truncate">
                            {city.name}
                          </span>
                          {city.province && (
                            <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded-full">
                              {city.province}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-white/40 flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {formatDate(city.date)}
                          </span>
                          <span className="text-[11px] text-white/40">
                            · {city.images.length} 张
                          </span>
                        </div>
                      </div>
                      <Star
                        className={`w-4 h-4 flex-shrink-0 transition-all ${
                          selectedCity?.name === city.name
                            ? 'text-amber-300 fill-amber-300'
                            : 'text-white/15 group-hover:text-indigo-300/60'
                        }`}
                      />
                    </button>
                  ))
                )}
              </div>

              {/* 底部提示 */}
              <div className="mt-6 pt-4 border-t border-white/10 text-[11px] text-white/30 leading-relaxed">
                每一张照片都拥有独立的留言空间，
                <br />
                点击照片即可在星河中留下你的话。
              </div>
            </div>
          </div>

          {/* 右侧：星河相片流 */}
          <div className="relative min-h-[calc(100vh-56px)]">
            {selectedCity ? (
              <PhotoRiver
                images={selectedCity.images}
                cityName={selectedCity.name}
                onPhotoClick={(index) => {
                  const url = selectedCity.images[index]
                  setChatPhoto({
                    url,
                    key: url,
                    cityName: selectedCity.name,
                  })
                  setView('chat')
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/30">
                <MapPin className="w-12 h-12 mb-3 opacity-30" />
                <p>选择一座城市，点亮星河</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
