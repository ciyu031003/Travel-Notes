'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, Calendar, MapPin, Image as ImageIcon, ArrowRight, X, Heart } from 'lucide-react'

function ParallaxImage({ children, maxOffset = 12 }: { children: React.ReactNode; maxOffset?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

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

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="transition-transform duration-300 ease-out"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {children}
    </div>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)

  const [showAlbumLock, setShowAlbumLock] = useState(false)
  const [albumPassword, setAlbumPassword] = useState('')
  const [albumError, setAlbumError] = useState('')
  const [albumVerifying, setAlbumVerifying] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/check-auth')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          setIsAuthed(true)
        }
      }
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      })

      if (res.ok) {
        router.push(redirect)
      } else {
        const data = await res.json()
        setError(data.error || '登录失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleAlbumUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setAlbumError('')
    setAlbumVerifying(true)

    try {
      const res = await fetch('/api/verify-album-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: albumPassword }),
      })

      if (res.ok) {
        setShowAlbumLock(false)
        setAlbumPassword('')
        router.push('/album')
      } else {
        const data = await res.json()
        setAlbumError(data.error || '验证失败')
      }
    } catch {
      setAlbumError('网络错误，请重试')
    } finally {
      setAlbumVerifying(false)
    }
  }

  const allCities = [
    { name: '北京', gradient: 'from-rose-300 to-red-400' },
    { name: '上海', gradient: 'from-blue-300 to-indigo-400' },
    { name: '广州', gradient: 'from-amber-300 to-orange-400' },
    { name: '深圳', gradient: 'from-emerald-300 to-teal-400' },
    { name: '杭州', gradient: 'from-pink-300 to-rose-400' },
    { name: '成都', gradient: 'from-teal-300 to-cyan-400' },
    { name: '西安', gradient: 'from-stone-300 to-amber-400' },
    { name: '南京', gradient: 'from-indigo-300 to-blue-400' },
    { name: '武汉', gradient: 'from-sky-300 to-blue-400' },
    { name: '重庆', gradient: 'from-rose-300 to-pink-400' },
    { name: '苏州', gradient: 'from-green-300 to-emerald-400' },
    { name: '厦门', gradient: 'from-cyan-300 to-sky-400' },
    { name: '青岛', gradient: 'from-cyan-300 to-teal-400' },
    { name: '大连', gradient: 'from-blue-300 to-cyan-400' },
    { name: '天津', gradient: 'from-slate-300 to-blue-400' },
    { name: '长沙', gradient: 'from-emerald-300 to-green-400' },
    { name: '哈尔滨', gradient: 'from-blue-300 to-indigo-400' },
    { name: '昆明', gradient: 'from-lime-300 to-green-400' },
    { name: '桂林', gradient: 'from-emerald-300 to-teal-400' },
    { name: '三亚', gradient: 'from-cyan-300 to-blue-400' },
    { name: '拉萨', gradient: 'from-yellow-300 to-amber-400' },
    { name: '大理', gradient: 'from-purple-300 to-violet-400' },
    { name: '丽江', gradient: 'from-violet-300 to-purple-400' },
    { name: '九寨沟', gradient: 'from-teal-300 to-emerald-400' },
    { name: '黄山', gradient: 'from-amber-300 to-yellow-400' },
    { name: '泰山', gradient: 'from-stone-300 to-amber-400' },
    { name: '华山', gradient: 'from-slate-300 to-stone-400' },
    { name: '武夷山', gradient: 'from-green-300 to-lime-400' },
    { name: '张家界', gradient: 'from-emerald-300 to-green-400' },
    { name: '香港', gradient: 'from-violet-300 to-purple-400' },
    { name: '澳门', gradient: 'from-amber-300 to-orange-400' },
    { name: '济南', gradient: 'from-lime-300 to-green-400' },
    { name: '郑州', gradient: 'from-emerald-300 to-teal-400' },
    { name: '沈阳', gradient: 'from-blue-300 to-indigo-400' },
    { name: '合肥', gradient: 'from-indigo-300 to-blue-400' },
    { name: '福州', gradient: 'from-cyan-300 to-teal-400' },
    { name: '南昌', gradient: 'from-teal-300 to-cyan-400' },
    { name: '贵阳', gradient: 'from-lime-300 to-emerald-400' },
    { name: '兰州', gradient: 'from-amber-300 to-stone-400' },
    { name: '乌鲁木齐', gradient: 'from-orange-300 to-red-400' },
  ]

  const [cityThumbnails, setCityThumbnails] = useState<typeof allCities>([])

  useEffect(() => {
    const shuffled = [...allCities].sort(() => Math.random() - 0.5)
    setCityThumbnails(shuffled.slice(0, 9))
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FAF6F2] via-[#F5EDE4] to-[#E8DDD4] relative overflow-hidden p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#F5DCE0]/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#D6E8F0]/30 rounded-full blur-3xl" />
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-[#E8B8C2]/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        <div className="grid lg:grid-cols-2 gap-0 bg-white/70 backdrop-blur-xl rounded-[2rem] shadow-[0_25px_80px_rgba(90,102,112,0.15)] border border-white/80 overflow-hidden min-h-[600px]">
          {/* 左侧 - 登录表单 */}
          <div className="relative p-8 md:p-10 lg:p-12 flex flex-col justify-between bg-gradient-to-br from-[#FFF8F3] via-[#FDF5ED] to-[#F8EDE0]">
            <div className="absolute top-4 right-4 flex items-center gap-2">
              {isAuthed && (
                <Link
                  href="/"
                  className="px-3 py-1.5 text-xs bg-[#E8B8C2]/20 text-[#8B4A5A] rounded-full hover:bg-[#E8B8C2]/30 transition-colors"
                >
                  已登录 · 进入地图
                </Link>
              )}
              <div className="w-10 h-10 bg-[#F5DCE0]/60 rounded-full flex items-center justify-center">
                <Lock className="w-4 h-4 text-[#8B7355]" />
              </div>
            </div>

            <div>
              <h1 className="text-5xl md:text-6xl font-bold text-[#5A4A3A] leading-tight mt-4">
                输入
                <br />
                <span className="bg-gradient-to-r from-[#E8B8C2] to-[#D4A5B0] bg-clip-text text-transparent">
                  纪念日
                </span>
              </h1>

              <p className="text-[#8B7355]/70 text-sm mt-4 leading-relaxed">
                一扇只给我们的地图门，密码藏在开始的那一天。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-8">
              <div>
                <label className="flex items-center justify-between text-sm text-[#8B7355]/70 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    登录账号
                  </span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7355]/40" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-white/60 border border-[#E8DDD4] rounded-2xl text-[#5A4A3A] placeholder-[#8B7355]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]/60 focus:border-transparent transition-all"
                    placeholder="请输入用户名"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7355]/40" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3.5 bg-white/60 border border-[#E8DDD4] rounded-2xl text-[#5A4A3A] placeholder-[#8B7355]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]/60 focus:border-transparent transition-all"
                    placeholder="请输入密码"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8B7355]/40 hover:text-[#8B7355] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 rounded-xl text-[#8B4A5A] text-sm">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-[#E8DDD4] text-[#E8B8C2] focus:ring-[#E8B8C2]/40 accent-[#E8B8C2]"
                    />
                  </div>
                  <span className="text-xs text-[#8B7355]/60 group-hover:text-[#8B7355] transition-colors">
                    记住我 (5小时)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-[#5A4A3A] to-[#6B5A48] text-[#FAF6F2] font-semibold rounded-2xl hover:from-[#4A3A2A] hover:to-[#5B4A38] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#5A4A3A]/20 hover:shadow-xl hover:shadow-[#5A4A3A]/30 active:scale-[0.98]"
              >
                {loading ? '解锁中...' : (
                  <>
                    解锁
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAlbumLock(true)}
                className="group flex items-center gap-2 px-4 py-2.5 bg-white/50 hover:bg-white/80 border border-[#E8DDD4] rounded-xl text-sm text-[#8B7355]/70 hover:text-[#5A4A3A] transition-all hover:shadow-sm"
              >
                <ImageIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>相册</span>
              </button>

              <Link
                href="/admin/login"
                className="text-xs text-[#8B7355]/50 hover:text-[#8B7355]/80 transition-colors"
              >
                管理员入口 →
              </Link>
            </div>
          </div>

          {/* 右侧 - 动画图片区域 */}
          <div className="relative p-8 md:p-10 lg:p-12 flex flex-col justify-between bg-gradient-to-br from-[#3D3530] via-[#4A3F38] to-[#3D3530] overflow-hidden">
            {/* 背景装饰 */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-10 right-10 w-32 h-32 bg-[#F5DCE0]/10 rounded-full blur-2xl" />
              <div className="absolute bottom-20 left-10 w-40 h-40 bg-[#D6E8F0]/10 rounded-full blur-2xl" />
            </div>

            {/* 顶部标签 */}
            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 backdrop-blur rounded-full border border-white/10">
                <div className="w-1.5 h-1.5 bg-[#E8B8C2] rounded-full" />
                <span className="text-xs text-white/70 font-medium">private album</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mt-6">
                旧照片
                <br />
                <span className="bg-gradient-to-r from-[#F5DCE0] to-[#D6E8F0] bg-clip-text text-transparent">
                  新地图
                </span>
              </h2>

              <p className="text-white/50 text-sm mt-4 leading-relaxed">
                从过去出发，
                <br />
                去看我们走过的地方。
              </p>
            </div>

            {/* 中间视差图片 */}
            <div className="relative z-10 my-8 flex justify-center">
              <ParallaxImage maxOffset={15}>
                <div className="relative">
                  {/* 主图片卡片 */}
                  <div
                    className="w-56 h-72 md:w-64 md:h-80 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10"
                    style={{
                      background: 'linear-gradient(135deg, #A8C8DC 0%, #D6E8F0 25%, #F5DCE0 60%, #E8B8C2 100%)',
                    }}
                  >
                    <div className="w-full h-full flex flex-col">
                      <div className="flex-1 relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-[#A8C8DC]/40 to-transparent" />
                        {/* 装饰性山景 */}
                        <div className="absolute bottom-0 left-0 right-0 h-1/2">
                          <svg viewBox="0 0 200 100" className="w-full h-full" preserveAspectRatio="none">
                            <path d="M0,100 L0,70 L40,40 L80,60 L120,30 L160,50 L200,20 L200,100 Z" fill="#8BA8B8" opacity="0.6" />
                            <path d="M0,100 L0,80 L50,55 L100,70 L150,45 L200,65 L200,100 Z" fill="#6B8A9A" opacity="0.5" />
                            <path d="M0,100 L0,90 L60,75 L120,85 L180,70 L200,80 L200,100 Z" fill="#4A6A7A" opacity="0.4" />
                          </svg>
                        </div>
                        {/* 装饰圆圈 */}
                        <div className="absolute top-4 right-4 w-8 h-8 bg-[#F5DCE0]/60 rounded-full" />
                        <div className="absolute top-16 left-6 w-3 h-3 bg-white/40 rounded-full" />
                      </div>
                      <div className="h-16 bg-gradient-to-b from-[#F5E6D0]/80 to-[#E8D5B8]/80 flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-sm font-bold text-[#5A4A3A]">济南</p>
                          <p className="text-[10px] text-[#8B7355]/70">泉边小记</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 浮动装饰 */}
                  <div className="absolute -top-4 -right-4 w-12 h-12 bg-[#F5DCE0]/30 rounded-full blur-sm" />
                  <div className="absolute -bottom-2 -left-6 w-8 h-8 bg-[#D6E8F0]/30 rounded-full blur-sm" />
                </div>
              </ParallaxImage>
            </div>

            {/* 底部城市缩略图 */}
            <div className="relative z-10">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center">
                {cityThumbnails.map((city, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-white/10 hover:border-white/40 transition-all duration-300 cursor-pointer group relative hover:scale-110 hover:shadow-lg hover:shadow-black/20"
                  >
                    <div className={`w-full h-full bg-gradient-to-br ${city.gradient}`} />
                    <div className="absolute inset-0 flex items-center justify-center p-1">
                      <span className="text-[10px] text-white/95 font-medium drop-shadow-md text-center leading-tight">
                        {city.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[#8B7355]/40 text-xs mt-6">
          Made with by 袁同学 & 阿比旦
        </p>
      </div>

      {showAlbumLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/80 overflow-hidden">
            <div className="relative p-8 bg-gradient-to-br from-[#FDF5ED] to-[#F5EDE4]">
              <button
                type="button"
                onClick={() => {
                  setShowAlbumLock(false)
                  setAlbumPassword('')
                  setAlbumError('')
                }}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-[#8B7355]/50 hover:text-[#8B7355] hover:bg-white/60 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                  <Heart className="w-8 h-8 text-white fill-white" />
                </div>

                <h3 className="text-xl font-bold text-[#5A4A3A]">
                  相册是我们的秘密
                </h3>
                <p className="text-sm text-[#8B7355]/70 mt-2">
                  请输入恋爱纪念日作为密码
                </p>
              </div>

              <form onSubmit={handleAlbumUnlock} className="mt-6 space-y-4">
                <div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7355]/40" />
                    <input
                      type="text"
                      value={albumPassword}
                      onChange={(e) => setAlbumPassword(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white/60 border border-[#E8DDD4] rounded-2xl text-[#5A4A3A] placeholder-[#8B7355]/40 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]/60 focus:border-transparent transition-all"
                      placeholder="如 2023-06-20"
                      required
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-[#8B7355]/40 mt-2 text-center">
                    支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 格式
                  </p>
                </div>

                {albumError && (
                  <div className="px-4 py-2.5 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 rounded-xl text-[#8B4A5A] text-sm text-center">
                    {albumError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={albumVerifying}
                  className="w-full py-3 bg-gradient-to-r from-[#E8B8C2] to-[#D4A5B0] text-white font-semibold rounded-2xl hover:from-[#D8A8B2] hover:to-[#C495A0] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#E8B8C2]/30"
                >
                  {albumVerifying ? '验证中...' : '解锁相册'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6F2]">
        <p className="text-[#8B7355]/60">加载中...</p>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
