'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, ArrowRight, X, Heart } from 'lucide-react'
import LoginDoor from '@/components/login/LoginDoor'

const allCities = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '西安', '南京', '武汉',
  '重庆', '苏州', '厦门', '青岛', '大连', '天津', '长沙', '哈尔滨', '昆明',
  '桂林', '三亚', '拉萨', '大理',
]

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

  const [cityThumbnails, setCityThumbnails] = useState<string[]>([])

  useEffect(() => {
    const shuffled = [...allCities].sort(() => Math.random() - 0.5)
    setCityThumbnails(shuffled.slice(0, 9))
  }, [])

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

  const inputCls =
    'w-full rounded-xl border border-[#E8DDD4] bg-white/70 py-3 pl-11 pr-4 text-[#3D4852] transition-all placeholder-[#9A958F] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C76E80]/50 dark:border-[#2C343E] dark:bg-[#161B22]/80 dark:text-[#E8E6E1] dark:placeholder-[#6E6A64]'

  return (
    <>
      <LoginDoor>
        <div className="flex min-h-screen items-center justify-center p-4 py-10">
          <div className="w-full max-w-md">
            <div className="rounded-3xl border border-white/60 bg-white/85 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-[#2C343E] dark:bg-[#1B2128]/85 md:p-9">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C76E80] shadow-sm">
                    <Heart className="h-4 w-4 fill-white text-white" />
                  </span>
                  <span className="font-bold text-[#3D4852] dark:text-[#E8E6E1]">我们的小家</span>
                </div>
                {isAuthed && (
                  <Link
                    href="/"
                    className="rounded-full bg-[#E8B8C2]/30 px-3 py-1.5 text-xs text-[#A64E61] transition-colors hover:bg-[#E8B8C2]/50 dark:text-[#E8B8C2]"
                  >
                    已登录 · 进入地图
                  </Link>
                )}
              </div>

              <h1 className="mt-7 font-display text-3xl font-bold leading-tight text-[#2D3842] dark:text-[#F1EFEA] md:text-4xl">
                输入我们的纪念日
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#5A6670] dark:text-[#9BA3AE]">
                一扇只给我们的地图门，密码藏在开始的那一天。
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-sm text-[#5A6670] dark:text-[#9BA3AE]">
                    <Lock className="h-4 w-4" />
                    登录账号
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A958F]" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={inputCls}
                      placeholder="请输入用户名"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-sm text-[#5A6670] dark:text-[#9BA3AE]">
                    <Lock className="h-4 w-4" />
                    登录密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A958F]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputCls} pr-12`}
                      placeholder="请输入密码"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9A958F] transition-colors hover:text-[#A64E61]"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-[#E8B8C2]/50 bg-[#F5DCE0]/40 px-4 py-3 text-sm text-[#A64E61] dark:border-[#5A3A44] dark:bg-[#3A2B31]/70 dark:text-[#E8B8C2]">
                    {error}
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[#E8DDD4] accent-[#C76E80]"
                  />
                  <span className="text-xs text-[#5A6670] dark:text-[#9BA3AE]">记住我 (5小时)</span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#A64E61] py-3.5 font-semibold text-white shadow-lg shadow-[#A64E61]/25 transition-all hover:bg-[#8B3A4C] hover:shadow-xl disabled:opacity-50 active:scale-[0.99]"
                >
                  {loading ? '解锁中...' : (
                    <>
                      解锁
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setShowAlbumLock(true)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#E8DDD8]/70 bg-white/60 px-4 py-2.5 text-sm text-[#5A6670] transition-colors hover:border-[#E8B8C2]/60 hover:text-[#A64E61] dark:border-[#2C343E] dark:bg-[#161B22]/60 dark:text-[#9BA3AE] dark:hover:text-[#E8B8C2]"
              >
                <Lock className="h-4 w-4" />
                相册解锁
              </button>

              <div className="mt-7 border-t border-[#E8DDD8]/60 pt-5 dark:border-[#2C343E]">
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {cityThumbnails.map((city, i) => (
                    <div
                      key={i}
                      className="flex h-14 w-14 flex-shrink-0 rotate-[-4deg] items-center justify-center rounded-full border-2 border-dashed border-[#E8B8C2]/80 bg-[#FDF8F5] dark:border-[#E8B8C2]/50 dark:bg-[#241E22]"
                    >
                      <span className="text-center text-[10px] font-medium leading-tight text-[#A64E61] dark:text-[#E8B8C2]">
                        {city}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-center text-[11px] text-[#5A6670] dark:text-[#9BA3AE]">
                  {cityThumbnails.length} 座城市的记忆邮戳
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-white/85 drop-shadow">
              Made with ♥ by 袁同学 & 阿比旦
            </p>
          </div>
        </div>
      </LoginDoor>

      {showAlbumLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-[#2C343E] dark:bg-[#1B2128]/95">
            <div className="relative bg-gradient-to-br from-[#FDF5ED] to-[#F5EDE4] p-8 dark:from-[#1E1A1C] dark:to-[#241E22]">
              <button
                type="button"
                onClick={() => {
                  setShowAlbumLock(false)
                  setAlbumPassword('')
                  setAlbumError('')
                }}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#8B7355]/50 transition-colors hover:bg-white/60 hover:text-[#8B7355] dark:text-[#C2AF9A]/60 dark:hover:bg-white/10 dark:hover:text-[#E4D6C4]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] shadow-lg">
                  <Heart className="h-8 w-8 fill-white text-white" />
                </div>
                <h3 className="text-xl font-bold text-[#5A4A3A] dark:text-[#E8E6E1]">
                  相册是我们的秘密
                </h3>
                <p className="mt-2 text-sm text-[#8B7355]/70 dark:text-[#C2AF9A]/80">
                  请输入恋爱纪念日作为密码
                </p>
              </div>

              <form onSubmit={handleAlbumUnlock} className="mt-6 space-y-4">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B7355]/40" />
                  <input
                    type="text"
                    value={albumPassword}
                    onChange={(e) => setAlbumPassword(e.target.value)}
                    className="w-full rounded-2xl border border-[#E8DDD4] bg-white/60 py-3 pl-11 pr-4 text-[#5A4A3A] transition-all placeholder-[#8B7355]/40 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]/60 dark:border-[#2C343E] dark:bg-[#161B22]/80 dark:text-[#E8E6E1] dark:placeholder-[#C2AF9A]/50"
                    placeholder="如 2023-06-20"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-center text-xs text-[#8B7355]/40 dark:text-[#C2AF9A]/50">
                  支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 格式
                </p>

                {albumError && (
                  <div className="rounded-xl border border-[#E8B8C2]/50 bg-[#F5DCE0]/40 px-4 py-2.5 text-center text-sm text-[#A64E61] dark:border-[#5A3A44] dark:bg-[#3A2B31]/70 dark:text-[#E8B8C2]">
                    {albumError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={albumVerifying}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#A64E61] py-3 font-semibold text-white shadow-lg shadow-[#A64E61]/30 transition-colors hover:bg-[#8B3A4C] disabled:opacity-50"
                >
                  {albumVerifying ? '验证中...' : '解锁相册'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#1A1F26]">
          <p className="text-white/60">加载中...</p>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
