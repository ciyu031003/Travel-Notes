'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Heart,
  BookOpen,
  MapPin,
  Globe2,
  Sparkles,
  ArrowRight,
  Lock,
  MessageCircle,
  X,
  Send,
  Quote,
  Settings,
  LogOut,
} from 'lucide-react'
import AlbumUnlockModal from './AlbumUnlockModal'

interface PostMeta {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  tags?: string[]
  location?: string
}

interface HomeClientProps {
  travelPosts: PostMeta[]
  blogPosts: PostMeta[]
  provincesVisitedCount: number
  totalPosts: number
}

const dailyQuotes = [
  '世界那么大，我想去看看',
  '人生不是一场赛跑，而是一次旅行',
  '生活不止眼前的苟且，还有诗和远方',
  '愿你我既能朝九晚五，也能浪迹天涯',
  '旅行的意义不在于目的地，而在于沿途的风景',
  '把时间浪费在美好的事物上',
  '愿我们都能成为自己的太阳',
  '心中有光，脚下有路',
  '愿你走出半生，归来仍是少年',
  '生活明朗，万物可爱',
  '愿所有的美好都如期而至',
  '星光不问赶路人，时光不负有心人',
  '保持热爱，奔赴山海',
  '愿你一生努力，一生被爱',
  '想要的都拥有，得不到的都释怀',
]

interface Danmaku {
  id: string
  text: string
  color: string
  timestamp: number
}

const danmakuColors = [
  '#E8B8C2',
  '#D6B8E0',
  '#B8D4E3',
  '#F5DCE0',
  '#A8D4B8',
  '#E8D5B8',
]

function getDailyQuote(): string {
  const today = new Date()
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  )
  return dailyQuotes[dayOfYear % dailyQuotes.length]
}

// 随机樱花飘落组件
function FloatingSakura({ side }: { side: 'left' | 'right' }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    right: side === 'right' ? `${Math.random() * 20}px` : 'auto',
    left: side === 'left' ? `${Math.random() * 20}px` : 'auto',
    top: '-20px',
    fontSize: `${12 + Math.random() * 16}px`,
    animation: `sakuraFall ${8 + Math.random() * 8}s linear ${Math.random() * 5}s infinite`,
    opacity: 0.6 + Math.random() * 0.4,
    pointerEvents: 'none',
    zIndex: 1,
  }
  return <span style={style}>🌸</span>
}

// 上升烟花组件
function RisingFirework({ side }: { side: 'left' | 'right' }) {
  const [exploded, setExploded] = useState(false)
  const [particles, setParticles] = useState<{ id: number; angle: number; color: string }[]>([])

  useEffect(() => {
    const explodeTimer = setTimeout(() => {
      setExploded(true)
      const colors = ['#E8B8C2', '#F5DCE0', '#D4A5B0', '#D6B8E0', '#B8D4E3', '#FFF5F7']
      const newParticles = Array.from({ length: 16 }, (_, i) => ({
        id: i,
        angle: (360 / 16) * i,
        color: colors[Math.floor(Math.random() * colors.length)],
      }))
      setParticles(newParticles)
    }, 2000 + Math.random() * 3000)

    const cycleTimer = setInterval(() => {
      setExploded(false)
      setParticles([])
      setTimeout(() => {
        setExploded(true)
        const colors = ['#E8B8C2', '#F5DCE0', '#D4A5B0', '#D6B8E0', '#B8D4E3', '#FFF5F7']
        const newParticles = Array.from({ length: 16 }, (_, i) => ({
          id: i,
          angle: (360 / 16) * i,
          color: colors[Math.floor(Math.random() * colors.length)],
        }))
        setParticles(newParticles)
      }, 500)
    }, 8000 + Math.random() * 4000)

    return () => {
      clearTimeout(explodeTimer)
      clearInterval(cycleTimer)
    }
  }, [])

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: side === 'left' ? '30px' : 'auto',
    right: side === 'right' ? '30px' : 'auto',
    bottom: '0',
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    background: '#E8B8C2',
    boxShadow: '0 0 6px 2px rgba(232,184,194,0.6)',
    animation: `fireworkRise ${4 + Math.random() * 2}s ease-out forwards`,
    pointerEvents: 'none',
    zIndex: 2,
  }

  return (
    <>
      {!exploded && <div style={baseStyle} />}
      {exploded && particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: side === 'left' ? '30px' : 'auto',
            right: side === 'right' ? '30px' : 'auto',
            bottom: '200px',
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 8px 2px ${p.color}`,
            transform: `rotate(${p.angle}deg) translateX(0)`,
            animation: `fireworkBurst 1.5s ease-out forwards`,
            animationDelay: `${p.angle * 0.005}s`,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      ))}
    </>
  )
}

// 渐变爱心组件
function FloatingHeart({ side }: { side: 'left' | 'right' }) {
  const [size, setSize] = useState(12 + Math.random() * 16)
  const [opacity, setOpacity] = useState(0.5 + Math.random() * 0.5)

  useEffect(() => {
    const timer = setInterval(() => {
      setSize(12 + Math.random() * 20)
      setOpacity(0.4 + Math.random() * 0.6)
    }, 3000 + Math.random() * 2000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        left: side === 'left' ? `${10 + Math.random() * 30}px` : 'auto',
        right: side === 'right' ? `${10 + Math.random() * 30}px` : 'auto',
        bottom: '-30px',
        fontSize: `${size}px`,
        opacity: opacity,
        animation: `heartFloat ${10 + Math.random() * 6}s ease-in-out infinite`,
        pointerEvents: 'none',
        zIndex: 1,
        filter: 'drop-shadow(0 2px 4px rgba(232,184,194,0.4))',
      }}
    >
      💗
    </div>
  )
}

// 角落装饰 - 花朵和藤蔓
function CornerDecoration({ corner }: { corner: 'bl' | 'br' }) {
  const isLeft = corner === 'bl'
  return (
    <div
      className={`fixed bottom-0 ${isLeft ? 'left-0' : 'right-0'} w-48 h-64 pointer-events-none z-[1] opacity-60`}
      style={{
        transform: isLeft ? '' : 'scaleX(-1)',
      }}
    >
      <svg viewBox="0 0 200 260" className="w-full h-full">
        {/* 藤蔓 */}
        <path
          d="M0,260 Q20,200 15,150 Q10,100 25,60 Q35,30 50,10"
          stroke="#A8D4B8"
          strokeWidth="2.5"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M0,260 Q30,180 25,120 Q20,70 40,30"
          stroke="#8BC4A8"
          strokeWidth="2"
          fill="none"
          opacity="0.5"
        />
        {/* 叶子 */}
        <g style={{ animation: 'leafSway 4s ease-in-out infinite', transformOrigin: '30px 180px' }}>
          <ellipse cx="28" cy="180" rx="12" ry="6" fill="#A8D4B8" transform="rotate(-30 28 180)" opacity="0.8" />
        </g>
        <g style={{ animation: 'leafSway 4.5s ease-in-out infinite 0.5s', transformOrigin: '22px 130px' }}>
          <ellipse cx="22" cy="130" rx="10" ry="5" fill="#8BC4A8" transform="rotate(-20 22 130)" opacity="0.7" />
        </g>
        <g style={{ animation: 'leafSway 5s ease-in-out infinite 1s', transformOrigin: '30px 80px' }}>
          <ellipse cx="30" cy="80" rx="14" ry="7" fill="#A8D4B8" transform="rotate(-25 30 80)" opacity="0.75" />
        </g>
        {/* 花朵 */}
        <g style={{ animation: 'flowerPulse 3s ease-in-out infinite', transformOrigin: '50px 10px' }}>
          <circle cx="50" cy="10" r="8" fill="#F5DCE0" opacity="0.9" />
          <circle cx="50" cy="10" r="4" fill="#E8B8C2" />
          <circle cx="42" cy="6" r="5" fill="#F5DCE0" opacity="0.85" />
          <circle cx="58" cy="6" r="5" fill="#F5DCE0" opacity="0.85" />
          <circle cx="46" cy="18" r="5" fill="#F5DCE0" opacity="0.85" />
          <circle cx="54" cy="18" r="5" fill="#F5DCE0" opacity="0.85" />
        </g>
        {/* 小花朵 */}
        <g style={{ animation: 'flowerPulse 3.5s ease-in-out infinite 0.7s', transformOrigin: '15px 100px' }}>
          <circle cx="15" cy="100" r="5" fill="#D6B8E0" opacity="0.85" />
          <circle cx="15" cy="100" r="2.5" fill="#C4A8D4" />
        </g>
        <g style={{ animation: 'flowerPulse 4s ease-in-out infinite 1.2s', transformOrigin: '20px 50px' }}>
          <circle cx="20" cy="50" r="6" fill="#D6E8F0" opacity="0.85" />
          <circle cx="20" cy="50" r="3" fill="#B8D4E3" />
        </g>
        {/* 心形花苞 */}
        <path
          d="M10,220 Q14,210 18,220 Q14,225 10,220"
          fill="#E8B8C2"
          opacity="0.7"
          style={{ animation: 'heartBeat 2s ease-in-out infinite' }}
        />
        <path
          d="M35,160 Q39,150 43,160 Q39,165 35,160"
          fill="#F5DCE0"
          opacity="0.7"
          style={{ animation: 'heartBeat 2.5s ease-in-out infinite 0.3s' }}
        />
      </svg>
    </div>
  )
}

export default function HomeClient({
  travelPosts,
  blogPosts,
  provincesVisitedCount,
  totalPosts,
}: HomeClientProps) {
  const [showAlbumUnlock, setShowAlbumUnlock] = useState(false)
  const [showDanmakuInput, setShowDanmakuInput] = useState(false)
  const [danmakuText, setDanmakuText] = useState('')
  const [danmakus, setDanmakus] = useState<Danmaku[]>([])
  const [username, setUsername] = useState<string | null>(null)
  const quote = getDailyQuote()

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/check-auth')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          setUsername(data.username)
        }
      }
    } catch {}
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
      setUsername(null)
    } catch {}
  }

  useEffect(() => {
    checkAuth()
  }, [])

  const sakuraLeft = Array.from({ length: 8 }, (_, i) => i)
  const sakuraRight = Array.from({ length: 8 }, (_, i) => i)
  const fireworkLeft = Array.from({ length: 2 }, (_, i) => i)
  const fireworkRight = Array.from({ length: 2 }, (_, i) => i)
  const heartLeft = Array.from({ length: 4 }, (_, i) => i)
  const heartRight = Array.from({ length: 4 }, (_, i) => i)

  useEffect(() => {
    const fetchDanmakus = async () => {
      try {
        const res = await fetch('/api/danmaku')
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.danmakus) {
            setDanmakus(data.data.danmakus)
          }
        }
      } catch {}
    }
    fetchDanmakus()
  }, [])

  const addDanmaku = async () => {
    if (!danmakuText.trim()) return

    const color = danmakuColors[Math.floor(Math.random() * danmakuColors.length)]
    try {
      const res = await fetch('/api/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: danmakuText.trim(), color }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.danmaku) {
          setDanmakus((prev) => [data.data.danmaku, ...prev])
        }
      }
    } catch {}

    setDanmakuText('')
    setShowDanmakuInput(false)
  }

  const removeDanmaku = async (id: string) => {
    try {
      const res = await fetch(`/api/danmaku?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDanmakus((prev) => prev.filter((d) => d.id !== id))
      }
    } catch {}
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#FAFBF7] via-[#FDF8F5] to-[#FAFBF7] text-[#3D4852] overflow-hidden">
      {/* 全局动画样式 */}
      <style>{`
        @keyframes sakuraFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.6; }
          100% { transform: translateY(105vh) rotate(360deg); opacity: 0; }
        }
        @keyframes fireworkRise {
          0% { transform: translateY(0); opacity: 1; }
          70% { transform: translateY(-250px); opacity: 1; }
          100% { transform: translateY(-300px); opacity: 0; }
        }
        @keyframes fireworkBurst {
          0% { transform: rotate(var(--angle, 0deg)) translateX(0) scale(1); opacity: 1; }
          100% { transform: rotate(var(--angle, 0deg)) translateX(60px) scale(0); opacity: 0; }
        }
        @keyframes heartFloat {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          15% { opacity: 0.8; transform: translateY(-100px) scale(0.8); }
          50% { transform: translateY(-300px) scale(1.1); }
          85% { opacity: 0.6; }
          100% { transform: translateY(-600px) scale(0.4); opacity: 0; }
        }
        @keyframes leafSway {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }
        @keyframes flowerPulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes heartBeat {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        @keyframes borderRainbow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes borderFlow {
          0% { --angle: 0deg; }
          100% { --angle: 360deg; }
        }
        @keyframes fadeIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes floatRight {
          from { transform: translateX(0); }
          to { transform: translateX(calc(100vw + 100%)); }
        }
        @keyframes aurora {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {/* 底部雾气带 */}
      <div
        className="fixed inset-x-0 bottom-0 h-[40vh] pointer-events-none opacity-40"
        style={{
          background:
            'linear-gradient(to bottom, rgba(214,232,240,0) 0%, rgba(214,232,240,0.28) 50%, rgba(214,232,240,0.18) 100%)',
        }}
      />

      {/* 左侧动画层 */}
      <div className="fixed left-0 top-0 w-20 h-full pointer-events-none overflow-hidden z-[2]">
        {sakuraLeft.map((i) => (
          <FloatingSakura key={`sakura-l-${i}`} side="left" />
        ))}
        {fireworkLeft.map((i) => (
          <RisingFirework key={`fw-l-${i}`} side="left" />
        ))}
        {heartLeft.map((i) => (
          <FloatingHeart key={`heart-l-${i}`} side="left" />
        ))}
      </div>

      {/* 右侧动画层 */}
      <div className="fixed right-0 top-0 w-20 h-full pointer-events-none overflow-hidden z-[2]">
        {sakuraRight.map((i) => (
          <FloatingSakura key={`sakura-r-${i}`} side="right" />
        ))}
        {fireworkRight.map((i) => (
          <RisingFirework key={`fw-r-${i}`} side="right" />
        ))}
        {heartRight.map((i) => (
          <FloatingHeart key={`heart-r-${i}`} side="right" />
        ))}
      </div>

      {/* 角落装饰 */}
      <CornerDecoration corner="bl" />
      <CornerDecoration corner="br" />

      {/* 顶部导航栏 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#FAFBF7]/85 backdrop-blur-md border-b border-[#D8DDD8]/40">
        <nav className="w-full h-14 flex items-center justify-between px-3 md:px-5">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-[#3D4852] flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-xl flex items-center justify-center shadow-sm">
              <Heart className="w-4 h-4 text-white fill-white" />
            </div>
            <span>我们的小家</span>
          </Link>
          <div className="flex items-center gap-1.5 md:gap-2.5">
            <Link
              href="/travel"
              className="group relative px-2.5 md:px-3 py-2 text-sm text-[#5A4A3A] hover:text-[#3D4852] rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 overflow-hidden"
            >
              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FFE8D6] via-[#F5DCE0] to-[#E8D5B8] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="absolute inset-[1.5px] rounded-[10px] bg-[#FAFBF7]" />
              <span className="absolute inset-[1.5px] rounded-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(90deg, #FFE8D6, #F5DCE0, #E8D5B8, #F5DCE0, #FFE8D6)',
                  backgroundSize: '300% 100%',
                  animation: 'aurora 3s linear infinite',
                }}
              />
              <span className="relative z-10 flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span className="hidden sm:inline">旅行地图</span>
              </span>
            </Link>
            <Link
              href="/notes"
              className="group relative px-2.5 md:px-3 py-2 text-sm text-[#5A4A3A] hover:text-[#3D4852] rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 overflow-hidden"
            >
              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#E8D5B8] via-[#D4C5A8] to-[#F5DCE0] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="absolute inset-[1.5px] rounded-[10px] bg-[#FAFBF7]" />
              <span className="absolute inset-[1.5px] rounded-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(90deg, #E8D5B8, #D4C5A8, #F5DCE0, #E8D5B8)',
                  backgroundSize: '300% 100%',
                  animation: 'aurora 3s linear infinite',
                }}
              />
              <span className="relative z-10 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">学习笔记</span>
              </span>
            </Link>
            <button
              onClick={() => setShowDanmakuInput(true)}
              className="group relative px-2.5 md:px-3 py-2 text-sm text-[#5A4A3A] hover:text-[#3D4852] rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 overflow-hidden"
            >
              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FFB5C5] via-[#E8B8C2] to-[#D6B8E0] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="absolute inset-[1.5px] rounded-[10px] bg-[#FAFBF7]" />
              <span className="absolute inset-[1.5px] rounded-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(90deg, #FFB5C5, #E8B8C2, #D6B8E0, #B8D4E3, #FFB5C5)',
                  backgroundSize: '300% 100%',
                  animation: 'aurora 3s linear infinite',
                }}
              />
              <span className="relative z-10 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">留言</span>
              </span>
            </button>
            <button
              onClick={() => setShowAlbumUnlock(true)}
              className="group relative px-2.5 md:px-3 py-2 text-sm text-[#5A4A3A] hover:text-[#3D4852] rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 overflow-hidden"
            >
              <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#D6E8F0] via-[#B8D4E3] to-[#D6B8E0] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="absolute inset-[1.5px] rounded-[10px] bg-[#FAFBF7]" />
              <span className="absolute inset-[1.5px] rounded-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(90deg, #D6E8F0, #B8D4E3, #D6B8E0, #E8D4E8, #D6E8F0)',
                  backgroundSize: '300% 100%',
                  animation: 'aurora 3s linear infinite',
                }}
              />
              <span className="relative z-10 flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                <span className="hidden sm:inline">相册</span>
              </span>
            </button>
            {username ? (
              <div className="flex items-center gap-1.5 pl-2 md:pl-3 ml-1 md:ml-2 border-l border-[#D8DDD8]/60">
                <span className="text-sm font-medium text-[#3D4852] whitespace-nowrap">{username}</span>
                <Link
                  href="/admin"
                  className="p-2 rounded-lg text-[#5A6670] hover:text-[#3D4852] hover:bg-[#F5DCE0]/30 transition-colors flex-shrink-0"
                  title="管理后台"
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg text-[#5A6670] hover:text-[#C44A5A] hover:bg-[#F5DCE0]/30 transition-colors flex-shrink-0"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3 md:px-4 py-2 text-sm bg-gradient-to-r from-[#E8B8C2] to-[#D4A5B0] text-white rounded-xl hover:from-[#D8A8B2] hover:to-[#C495A0] transition-all shadow-md shadow-[#E8B8C2]/20 whitespace-nowrap flex-shrink-0 font-medium"
              >
                登录
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* 弹幕层 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-30">
        {danmakus.map((d, index) => (
          <DanmakuItem
            key={d.id}
            danmaku={d}
            topOffset={5 + (index % 8) * 11}
            duration={15 + (index % 5) * 3}
            delay={(index % 10) * 2.5}
          />
        ))}
      </div>

      <div className="relative z-10 pt-14">
        {/* Hero 区域 */}
        <section className="pt-16 pb-8 px-3 md:px-5">
          <div className="max-w-5xl mx-auto">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/85 border border-[#E8B8C2]/40 text-[#5A4A3A] rounded-full text-sm mb-6 shadow-sm">
                <Sparkles className="w-4 h-4 text-[#E8B8C2]" />
                <span>Welcome to our little world</span>
              </div>

              <h1 className="relative text-5xl md:text-7xl font-bold mb-6 leading-tight">
                <span className="block text-[#2D3842]">
                  一起
                  <span className="relative inline-block mx-2">
                    <span className="bg-gradient-to-r from-[#E8B8C2] via-[#D4A5B0] to-[#B89FC0] bg-clip-text text-transparent">
                      走过的
                    </span>
                    <svg
                      className="absolute -bottom-2 left-0 w-full h-3 text-[#E8B8C2]/50"
                      viewBox="0 0 200 12"
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M0,8 Q50,2 100,6 T200,4"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  地方
                </span>
                <span className="block text-xl md:text-2xl font-normal mt-4 text-[#4A5560] tracking-wider">
                  Travel Journal · 记录我们的美好时光
                </span>
              </h1>

              <p className="text-base md:text-lg text-[#4A5560] max-w-xl mx-auto mb-10 leading-relaxed">
                用文字记录生活，用照片定格瞬间
                <br />
                在这个小小的世界里，收藏我们的每一份感动
              </p>

              <div className="flex flex-wrap justify-center gap-3 mb-12">
                <div className="flex items-center gap-2 px-5 py-3 bg-white/85 border border-[#D8DDD8]/60 rounded-2xl text-sm shadow-sm hover:shadow-md transition-shadow">
                  <Globe2 className="w-4 h-4 text-[#E8B8C2]" />
                  <span className="font-medium text-[#3D4852]">{provincesVisitedCount}</span>
                  <span className="text-[#5A6670]">个省份</span>
                </div>
                <div className="flex items-center gap-2 px-5 py-3 bg-white/85 border border-[#D8DDD8]/60 rounded-2xl text-sm shadow-sm hover:shadow-md transition-shadow">
                  <MapPin className="w-4 h-4 text-[#E8B8C2]" />
                  <span className="font-medium text-[#3D4852]">{travelPosts.length}</span>
                  <span className="text-[#5A6670]">篇旅行</span>
                </div>
                <div className="flex items-center gap-2 px-5 py-3 bg-white/85 border border-[#D8DDD8]/60 rounded-2xl text-sm shadow-sm hover:shadow-md transition-shadow">
                  <BookOpen className="w-4 h-4 text-[#E8B8C2]" />
                  <span className="font-medium text-[#3D4852]">{totalPosts}</span>
                  <span className="text-[#5A6670]">篇笔记</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 每日一言 */}
        <section className="px-3 md:px-5 pb-10">
          <div className="max-w-5xl mx-auto">
            <div className="relative bg-gradient-to-br from-white/90 to-[#FDF8F5]/90 rounded-3xl p-8 shadow-xl border border-[#E8B8C2]/25 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#F5DCE0]/25 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#D6E8F0]/25 rounded-full blur-2xl" />

              <div className="relative z-10 text-center">
                <div className="inline-flex items-center gap-2 text-[#5A4A3A] text-sm mb-4 font-medium">
                  <Quote className="w-4 h-4" />
                  <span>每日一言</span>
                  <Quote className="w-4 h-4" />
                </div>
                <p className="text-xl md:text-2xl text-[#3D4852] font-medium leading-relaxed">
                  {quote}
                </p>
                <div className="mt-4 text-sm text-[#5A6670]">
                  — {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 地图入口 - 大型组件 */}
        <section className="px-3 md:px-5 pb-6">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/travel"
              className="group relative block overflow-hidden rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#F5DCE0] via-[#E8B8C2] to-[#D4A5B0]" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjIiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xNSkiLz48L2c+PC9zdmc+')] opacity-50" />
              <div className="absolute -right-8 -top-8 w-64 h-64 bg-white/20 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute -left-8 -bottom-8 w-48 h-48 bg-[#D6E8F0]/30 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-500" />

              <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/30 backdrop-blur-sm text-white rounded-full text-sm font-medium mb-4">
                    <MapPin className="w-4 h-4" />
                    <span>中国旅行地图</span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 drop-shadow-sm">
                    点击进入旅行地图
                  </h2>
                  <p className="text-white/90 text-base md:text-lg mb-5 max-w-md">
                    交互式中国地图，点击省份查看旅行记录
                  </p>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                    <div className="flex items-center gap-2 text-white/95">
                      <Globe2 className="w-5 h-5" />
                      <span className="text-sm">{provincesVisitedCount} 个省份</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/95">
                      <MapPin className="w-5 h-5" />
                      <span className="text-sm">{travelPosts.length} 篇旅行</span>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#C495A0] font-semibold rounded-2xl shadow-lg group-hover:bg-white/90 group-hover:scale-105 transition-all">
                    <span>打开地图</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* 其他功能卡片 */}
        <section className="px-3 md:px-5 pb-12">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 相册 */}
              <button
                onClick={() => setShowAlbumUnlock(true)}
                className="rainbow-card group relative bg-white/85 rounded-3xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border-2 border-transparent overflow-hidden text-left"
              >
                <span className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, #D6E8F0, #B8D4E3, #D6B8E0, #E8D4E8, #D6E8F0)',
                    backgroundSize: '300% 100%',
                    animation: 'aurora 3s linear infinite',
                    padding: '2px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-[#D6E8F0]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#D6E8F0] to-[#B8D4E3] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-md">
                    <Heart className="w-7 h-7 text-white fill-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#3D4852] mb-2">
                    我们的相册
                  </h3>
                  <p className="text-sm text-[#5A6670] mb-4">
                    恋爱纪念日解锁
                  </p>
                  <div className="flex items-center gap-1.5 text-[#5A8BA0] text-sm font-medium">
                    <span>查看相册</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>

              {/* 学习笔记 */}
              <Link
                href="/notes"
                className="rainbow-card group relative bg-white/85 rounded-3xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border-2 border-transparent overflow-hidden"
              >
                <span className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, #E8D5B8, #D4C5A8, #F5DCE0, #E8D5B8)',
                    backgroundSize: '300% 100%',
                    animation: 'aurora 3s linear infinite',
                    padding: '2px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-[#E8D5B8]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#E8D5B8] to-[#D4C5A8] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-md">
                    <BookOpen className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#3D4852] mb-2">
                    学习笔记
                  </h3>
                  <p className="text-sm text-[#5A6670] mb-4">
                    技术博客与思维导图
                  </p>
                  <div className="flex items-center gap-1.5 text-[#A07850] text-sm font-medium">
                    <span>开始学习</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>

              {/* 留言板 */}
              <button
                onClick={() => setShowDanmakuInput(true)}
                className="rainbow-card group relative bg-white/85 rounded-3xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border-2 border-transparent overflow-hidden text-left"
              >
                <span className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, #E8D4E8, #C4A8C4, #D6B8E0, #E8D4E8)',
                    backgroundSize: '300% 100%',
                    animation: 'aurora 3s linear infinite',
                    padding: '2px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-[#E8D4E8]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#E8D4E8] to-[#C4A8C4] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-md">
                    <MessageCircle className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#3D4852] mb-2">
                    留言板
                  </h3>
                  <p className="text-sm text-[#5A6670] mb-4">
                    写下想对对方说的话
                  </p>
                  <div className="flex items-center gap-1.5 text-[#8A6A8A] text-sm font-medium">
                    <span>写留言</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* 最近旅行 */}
        <section className="px-3 md:px-5 pb-16">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white/85 rounded-3xl p-6 shadow-lg border border-[#D8DDD8]/40">
              <h3 className="text-lg font-semibold text-[#3D4852] mb-5 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#E8B8C2]" />
                最近旅行
              </h3>
              <div className="grid md:grid-cols-2 gap-3">
                {travelPosts.slice(0, 4).map((post) => (
                  <Link
                    key={post.slug}
                    href={`/travel/${post.slug}`}
                    className="block p-4 rounded-2xl hover:bg-[#F5DCE0]/20 transition-colors border border-transparent hover:border-[#E8B8C2]/25"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-xl flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[#3D4852] truncate">
                          {post.title}
                        </p>
                        <p className="text-xs text-[#5A6670] mt-1">
                          {new Date(post.date).toLocaleDateString('zh-CN')}
                          {post.location && ` · ${post.location}`}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#B8B8B8] flex-shrink-0 mt-1" />
                    </div>
                  </Link>
                ))}
                {travelPosts.length === 0 && (
                  <p className="col-span-2 text-sm text-[#5A6670] text-center py-8">
                    暂无旅行记录
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 底部 */}
        <footer className="relative z-10 py-8 px-3 md:px-5 border-t border-[#D8DDD8]/30">
          <div className="max-w-6xl mx-auto text-center">
            <p className="flex items-center justify-center gap-1.5 text-[#3D4852] text-sm">
              Made with <Heart className="w-4 h-4 text-[#E8B8C2] fill-[#E8B8C2]" /> by 袁同学 & 阿比旦
            </p>
            <p className="mt-2 text-[#5A6670] text-xs">
              © {new Date().getFullYear()} All rights reserved.
            </p>
          </div>
        </footer>
      </div>

      {/* 相册解锁弹窗 */}
      <AlbumUnlockModal
        isOpen={showAlbumUnlock}
        onClose={() => setShowAlbumUnlock(false)}
      />

      {/* 弹幕输入弹窗 */}
      {showDanmakuInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div className="p-6 bg-gradient-to-br from-[#FDF5ED] to-[#F5EDE4]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#3D4852] flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-[#E8B8C2]" />
                  写一句留言
                </h3>
                <button
                  onClick={() => {
                    setShowDanmakuInput(false)
                    setDanmakuText('')
                  }}
                  className="w-8 h-8 flex items-center justify-center text-[#5A6670] hover:text-[#3D4852] hover:bg-white/60 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-[#5A6670] mb-4">
                写下你想对对方说的话，它会在首页飘动显示 ✨
              </p>

              <textarea
                value={danmakuText}
                onChange={(e) => setDanmakuText(e.target.value)}
                placeholder="在这里输入你的留言..."
                maxLength={50}
                className="w-full h-24 p-3 bg-white/70 border border-[#E8DDD4] rounded-2xl text-[#3D4852] placeholder-[#8B7355]/50 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]/60 focus:border-transparent transition-all resize-none"
              />
              <div className="text-right text-xs text-[#8B7355]/50 mt-1">
                {danmakuText.length}/50
              </div>

              <button
                onClick={addDanmaku}
                disabled={!danmakuText.trim()}
                className="w-full py-3 mt-4 bg-gradient-to-r from-[#E8B8C2] to-[#D4A5B0] text-white font-semibold rounded-2xl hover:from-[#D8A8B2] hover:to-[#C495A0] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#E8B8C2]/30"
              >
                <Send className="w-4 h-4" />
                <span>发送留言</span>
              </button>

              {danmakus.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#E8DDD4]/50">
                  <p className="text-xs text-[#5A6670] mb-2">历史留言 ({danmakus.length})</p>
                  <div className="max-h-20 overflow-y-auto space-y-1">
                    {danmakus.slice(0, 3).map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between text-xs bg-white/50 px-3 py-1.5 rounded-lg"
                      >
                        <span className="text-[#3D4852] truncate">{d.text}</span>
                        {username && (
                          <button
                            onClick={() => removeDanmaku(d.id)}
                            className="text-[#8B7355]/40 hover:text-[#C44A5A] ml-2"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DanmakuItem({
  danmaku,
  topOffset,
  duration,
  delay = 0,
}: {
  danmaku: Danmaku
  topOffset: number
  duration: number
  delay?: number
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), (delay + duration) * 1000)
    return () => clearTimeout(timer)
  }, [delay, duration])

  if (!visible) return null

  return (
    <div
      className="absolute whitespace-nowrap text-base font-medium pointer-events-auto"
      style={{
        top: `${topOffset}%`,
        left: '-100px',
        color: danmaku.color,
        textShadow: '0 1px 2px rgba(255,255,255,0.9)',
        animation: `floatRight ${duration}s linear ${delay}s forwards`,
        zIndex: 30,
      }}
    >
      <span className="inline-block px-3 py-1 bg-white/70 backdrop-blur-sm rounded-full shadow-sm">
        {danmaku.text}
      </span>
    </div>
  )
}
