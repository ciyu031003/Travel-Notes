'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, ArrowRight, X, Heart, MapPin } from 'lucide-react'
import LoginDoor from '@/components/login/LoginDoor'
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'

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
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [isRegistering, setIsRegistering] = useState(false)

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
      const res = await fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
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
      const res = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // App 原生壳登录：持久会话（免 5h 过期）；Web 保持 5h/7d
        body: JSON.stringify({ username, password, rememberMe, clientType: isNativePlatform() ? 'app' : 'web' }),
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (password.length < 6) {
      setError('密码至少需要 6 位字符')
      return
    }
    setIsRegistering(true)
    try {
      const res = await fetch(apiUrl('/api/register'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe, clientType: isNativePlatform() ? 'app' : 'web' }),
      })
      if (res.ok) {
        router.push(redirect)
      } else {
        const data = await res.json()
        setError(data.error || '注册失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setIsRegistering(false)
    }
  }

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  const handleAlbumUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setAlbumError('')
    setAlbumVerifying(true)

    try {
      const res = await fetch(apiUrl('/api/verify-album-password'), {
        method: 'POST',
        credentials: 'include',
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
    'w-full rounded-xl border border-travel-line bg-white/70 py-3 pl-11 pr-4 text-[#3D4852] transition-all placeholder-travel-sand/50 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/50 dark:border-shell-line dark:bg-shell-surface2/80 dark:text-shell-text dark:placeholder-[#6E6A64]'

  return (
    <>
      <LoginDoor>
        <div className="flex min-h-screen items-center justify-center p-4 py-10">
          <div className="w-full max-w-md">
            <div className="rounded-3xl border border-white/60 bg-white/85 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-shell-line dark:bg-shell-surface/85 md:p-9">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-travel-accentSoft shadow-sm">
                    <MapPin className="h-4 w-4 text-white" />
                  </span>
                  <span className="font-bold text-[#3D4852] dark:text-shell-text">行迹</span>
                </div>
                {isAuthed && (
                  <Link
                    href="/"
                    className="rounded-full bg-travel-bloom/30 px-3 py-1.5 text-xs text-travel-accent transition-colors hover:bg-travel-bloom/50 dark:text-travel-bloom"
                  >
                    已登录 · 进入空间
                  </Link>
                )}
              </div>

              <h1 className="mt-7 font-display text-3xl font-bold leading-tight text-[#2D3842] dark:text-[#F1EFEA] md:text-4xl">
                {mode === 'login' ? '登录你的旅行记忆空间' : '注册一个新的行迹账号'}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-travel-ink dark:text-shell-muted">
                {mode === 'login'
                  ? '登录后继续沉淀你的旅行与故事。'
                  : '注册后开启属于你的旅行记忆空间。'}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-sm text-travel-ink dark:text-shell-muted">
                    <Lock className="h-4 w-4" />
                    登录账号
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-travel-sand/50" />
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
                  <label className="mb-2 flex items-center gap-1.5 text-sm text-travel-ink dark:text-shell-muted">
                    <Lock className="h-4 w-4" />
                    登录密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-travel-sand/50" />
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
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-travel-sand/50 transition-colors hover:text-travel-accent"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-sm text-travel-ink dark:text-shell-muted">
                      <Lock className="h-4 w-4" />
                      确认密码
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-travel-sand/50" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputCls} pr-12`}
                        placeholder="请再次输入密码"
                        required
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="animate-[fadeIn_0.3s_ease] rounded-xl border border-travel-bloom/50 bg-travel-sakura/40 px-4 py-3 text-sm text-travel-accent dark:border-[#4A3427] dark:bg-[#32261D]/70 dark:text-travel-bloom">
                    {error}
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-travel-line accent-travel-accentSoft"
                  />
                  <span className="text-xs text-travel-ink dark:text-shell-muted">记住我 (5小时)</span>
                </label>

                <button
                  type="submit"
                  disabled={loading || isRegistering}
                  onClick={mode === 'register' ? handleRegister : undefined}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-travel-accent py-3.5 font-semibold text-white shadow-lg shadow-travel-accent/25 transition-all hover:bg-travel-accentStrong hover:shadow-xl disabled:opacity-50 active:scale-[0.99]"
                >
                  {mode === 'login'
                    ? (loading ? '解锁中...' : (<>
                        解锁
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>))
                    : (isRegistering ? '注册中...' : (<>
                        注册并进入
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>))}
                </button>
              </form>

              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-travel-line/70 bg-white/60 px-4 py-2.5 text-sm text-travel-ink transition-all hover:border-travel-bloom/60 hover:text-travel-accent active:scale-[0.99] dark:border-shell-line dark:bg-shell-surface2/60 dark:text-shell-muted dark:hover:text-travel-bloom"
              >
                {mode === 'login' ? (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-travel-bloom" />
                    没有账号？注册一个
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    已有账号？返回登录
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowAlbumLock(true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-travel-line/70 bg-white/60 px-4 py-2.5 text-sm text-travel-ink transition-colors hover:border-travel-bloom/60 hover:text-travel-accent dark:border-shell-line dark:bg-shell-surface2/60 dark:text-shell-muted dark:hover:text-travel-bloom"
              >
                <Lock className="h-4 w-4" />
                相册解锁
              </button>

              <div className="mt-7 border-t border-travel-line/60 pt-5 dark:border-shell-line">
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {cityThumbnails.map((city, i) => (
                    <div
                      key={i}
                      className="flex h-14 w-14 flex-shrink-0 rotate-[-4deg] items-center justify-center rounded-full border-2 border-dashed border-travel-bloom/80 bg-travel-parchment dark:border-travel-bloom/50 dark:bg-[#241E22]"
                    >
                      <span className="text-center text-[10px] font-medium leading-tight text-travel-accent dark:text-travel-bloom">
                        {city}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-center text-[11px] text-travel-ink dark:text-shell-muted">
                  {cityThumbnails.length} 座城市的记忆邮戳
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-white/85 drop-shadow">
              Made with ♥ by 行迹
            </p>
          </div>
        </div>
      </LoginDoor>

      {showAlbumLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-shell-line dark:bg-shell-surface/95">
            <div className="relative bg-gradient-to-br from-travel-parchment to-travel-parchmentDim p-8 dark:from-[#1E1A1C] dark:to-[#241E22]">
              <button
                type="button"
                onClick={() => {
                  setShowAlbumLock(false)
                  setAlbumPassword('')
                  setAlbumError('')
                }}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-travel-sand/50 transition-colors hover:bg-white/60 hover:text-travel-sand dark:text-travel-sandSoft/60 dark:hover:bg-white/10 dark:hover:text-[#E4D6C4]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-travel-sakura to-travel-bloom shadow-lg">
                  <Heart className="h-8 w-8 fill-white text-white" />
                </div>
                <h3 className="text-xl font-bold text-travel-inkStrong dark:text-shell-text">
                  相册已上锁
                </h3>
                <p className="mt-2 text-sm text-travel-sand/70 dark:text-travel-sandSoft/80">
                  请输入相册解锁密码
                </p>
              </div>

              <form onSubmit={handleAlbumUnlock} className="mt-6 space-y-4">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-travel-sand/40" />
                  <input
                    type="text"
                    value={albumPassword}
                    onChange={(e) => setAlbumPassword(e.target.value)}
                    className="w-full rounded-2xl border border-travel-line bg-white/60 py-3 pl-11 pr-4 text-travel-inkStrong transition-all placeholder-travel-sand/40 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-bloom/60 dark:border-shell-line dark:bg-shell-surface2/80 dark:text-shell-text dark:placeholder-travel-sandSoft/50"
                    placeholder="如 2023-06-20"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-center text-xs text-travel-sand/40 dark:text-travel-sandSoft/50">
                  支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 格式
                </p>

                {albumError && (
                  <div className="rounded-xl border border-travel-bloom/50 bg-travel-sakura/40 px-4 py-2.5 text-center text-sm text-travel-accent dark:border-[#4A3427] dark:bg-[#32261D]/70 dark:text-travel-bloom">
                    {albumError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={albumVerifying}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-travel-accent py-3 font-semibold text-white shadow-lg shadow-travel-accent/30 transition-colors hover:bg-travel-accentStrong disabled:opacity-50"
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
