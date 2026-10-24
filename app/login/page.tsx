'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, ArrowRight, X, Heart } from 'lucide-react'
import LoginDoor from '@/components/login/LoginDoor'
import BrandLogo from '@/components/brand/BrandLogo'
import { Icon } from '@/components/mobile/Icon'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Button } from '@/components/mobile/Button'
import { Field } from '@/components/mobile/Field'
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { hapticError, hapticSuccess } from '@/lib/mobile/haptics'
import IcpLicense from '@/components/IcpLicense'

const allCities = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '西安', '南京', '武汉',
  '重庆', '苏州', '厦门', '青岛', '大连', '天津', '长沙', '哈尔滨', '昆明',
  '桂林', '三亚', '拉萨', '大理',
]

/**
 * 相册解锁面板体（P-13 跨端收敛，2026-10-24）。
 *
 * 桌面 Modal 与移动 BottomSheet 的**唯一内容源**（标题/副标题/输入/提示/错误/按钮）：
 * 此前两处各写一份 JSX，副标题已经漂移过一次（"相册解锁密码" vs "纪念日作为解锁密码"）。
 * 外壳（桌面 parchment 卡片 / 移动 sheet）各自保留，壳内内容必须从这里渲染。
 * tone 只决定 token 档，结构与文案只有一份。
 */
function AlbumUnlockBody({
  tone,
  password,
  onPasswordChange,
  error,
  verifying,
  onSubmit,
}: {
  tone: 'parchment' | 'sheet'
  password: string
  onPasswordChange: (v: string) => void
  error: string
  verifying: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  const cls =
    tone === 'parchment'
      ? {
          title: 'text-xl font-bold text-travel-inkStrong dark:text-shell-text',
          subtitle: 'mt-2 text-sm text-travel-sand dark:text-travel-sandSoft',
          error: 'border border-travel-bloom/50 bg-travel-sakura/40 text-travel-accent dark:border-shell-line dark:bg-shell-surface/70 dark:text-travel-bloom',
        }
      : {
          title: 'mt-4 text-[22px] font-bold tracking-[-0.02em] text-[var(--m-text)]',
          subtitle: 'mt-1.5 text-sm text-[var(--m-muted)]',
          error: 'border border-[rgba(224,108,108,0.35)] bg-[rgba(224,108,108,0.12)] text-[var(--danger-soft)]',
        }
  return (
    <div className="flex w-full flex-col items-center text-center">
      <h3 className={cls.title}>相册已上锁</h3>
      <p className={cls.subtitle}>请输入纪念日作为解锁密码</p>

      <form onSubmit={onSubmit} className="mt-4 w-full space-y-3">
        <Field
          type="text"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          leadingIcon={Lock}
          placeholder="如 2023-06-20"
          required
          autoFocus
        />
        <p className="text-center text-xs text-[var(--m-faint)]">
          支持 YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 格式
        </p>

        {error && (
          <div className={`rounded-xl px-4 py-2.5 text-center text-sm ${cls.error}`}>{error}</div>
        )}

        <Button type="submit" block loading={verifying} disabled={verifying} className="mt-2">
          {verifying ? '验证中…' : '解锁相册'}
        </Button>
      </form>
    </div>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // 登录后落地页：仅接受站内相对路径（防开放重定向），默认进应用首页 /
  // （生产环境的 / 由 Next.js 应用服务；若 / 仍被门户遮蔽，务必按
  // docs/DEPLOY-PORTAL-HOMEPAGE.md 把门户迁到 /portal，让 / 恢复为应用首页。）
  const rawRedirect = searchParams.get('redirect')
  const redirect = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/'

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
        void hapticSuccess()
        router.push(redirect)
      } else {
        const data = await res.json()
        setError(data.error || '登录失败')
        void hapticError()
      }
    } catch {
      setError('网络错误，请重试')
      void hapticError()
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
    if (password.length < 8) {
      setError('密码至少需要 8 位字符')
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
        void hapticSuccess()
        router.push(redirect)
      } else {
        const data = await res.json()
        setError(data.error || '注册失败')
        void hapticError()
      }
    } catch {
      setError('网络错误，请重试')
      void hapticError()
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
        void hapticSuccess()
        setShowAlbumLock(false)
        setAlbumPassword('')
        router.push('/album')
      } else {
        const data = await res.json()
        setAlbumError(data.error || '验证失败')
        void hapticError()
      }
    } catch {
      setAlbumError('网络错误，请重试')
      void hapticError()
    } finally {
      setAlbumVerifying(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-travel-line bg-white/70 py-3 pl-11 pr-4 text-travel-ink transition-all placeholder-travel-sand/50 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-travel-accentSoft/50 dark:border-shell-line dark:bg-shell-surface2/80 dark:text-shell-text dark:placeholder-shell-faint'

  return (
    <>
      <LoginDoor>
        <div className="m-safe-top-24 flex min-h-dvh items-start justify-center px-4 pb-[max(28px,env(safe-area-inset-bottom))] md:items-center md:py-10">
          <div className="w-full max-w-md">
            <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl dark:border-shell-line dark:bg-shell-surface/90 sm:p-7 md:p-9">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrandLogo size={36} rounded="rounded-lg" />
                  <span className="font-bold text-travel-ink dark:text-shell-text">甜途</span>
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

              <h1 className="mt-5 font-display text-[26px] font-bold leading-snug text-balance text-[#2D3842] dark:text-shell-text sm:text-3xl md:mt-7 md:text-4xl">
                {mode === 'login' ? '登录你的旅行记忆空间' : '注册一个新的甜途账号'}
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-travel-ink dark:text-shell-muted md:mt-3">
                {mode === 'login'
                  ? '登录后继续沉淀你的旅行与故事。'
                  : '注册后开启属于你的旅行记忆空间。'}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4 md:mt-8">
                <div>
                  <label htmlFor="login-username" className="mb-2 flex items-center gap-1.5 text-sm text-travel-ink dark:text-shell-muted">
                    <Icon icon={Lock} size="sm" />
                    登录账号
                  </label>
                  <div className="relative">
                    <Icon icon={Lock} size="sm" className="absolute left-4 top-1/2 -translate-y-1/2 text-travel-sand/50" />
                    <input
                      id="login-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={inputCls}
                      placeholder="请输入用户名"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="mb-2 flex items-center gap-1.5 text-sm text-travel-ink dark:text-shell-muted">
                    <Icon icon={Lock} size="sm" />
                    登录密码
                  </label>
                  <div className="relative">
                    <Icon icon={Lock} size="sm" className="absolute left-4 top-1/2 -translate-y-1/2 text-travel-sand/50" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputCls} pr-12`}
                      placeholder="请输入密码"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      // 触达 ≥44px（设计规范 §1/§8）：视觉图标小，热区扩大到 44 并右移对齐输入框内缘
                      className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-travel-sand/50 transition-colors hover:text-travel-accent"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? <Icon icon={EyeOff} size="sm" /> : <Icon icon={Eye} size="sm" />}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label htmlFor="login-confirm-password" className="mb-2 flex items-center gap-1.5 text-sm text-travel-ink dark:text-shell-muted">
                      <Icon icon={Lock} size="sm" />
                      确认密码
                    </label>
                    <div className="relative">
                      <Icon icon={Lock} size="sm" className="absolute left-4 top-1/2 -translate-y-1/2 text-travel-sand/50" />
                      <input
                        id="login-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputCls} pr-12`}
                        placeholder="请再次输入密码"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="animate-[fadeIn_0.3s_ease] rounded-xl border border-travel-bloom/50 bg-travel-sakura/40 px-4 py-3 text-sm text-travel-accent dark:border-shell-line dark:bg-shell-surface/70 dark:text-travel-bloom">
                    {error}
                  </div>
                )}

                {/* 触达 ≥44px：整行都是点击区（此前复选框仅 16px，登录页是未登录用户唯一能看到的页面） */}
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-5 w-5 rounded border-travel-line accent-travel-accentSoft"
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
                        <Icon icon={ArrowRight} size="sm" className="transition-transform group-hover:translate-x-0.5" />
                      </>))
                    : (isRegistering ? '注册中...' : (<>
                        注册并进入
                        <Icon icon={ArrowRight} size="sm" className="transition-transform group-hover:translate-x-0.5" />
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
                    <Icon icon={Lock} size="sm" />
                    已有账号？返回登录
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowAlbumLock(true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-travel-line/70 bg-white/60 px-4 py-2.5 text-sm text-travel-ink transition-colors hover:border-travel-bloom/60 hover:text-travel-accent dark:border-shell-line dark:bg-shell-surface2/60 dark:text-shell-muted dark:hover:text-travel-bloom"
              >
                <Icon icon={Lock} size="sm" />
                相册解锁
              </button>

              <div className="mt-5 border-t border-travel-line/60 pt-4 dark:border-shell-line">
                {/* 可横向滚动的区域必须可聚焦（WCAG 2.1.1 / axe scrollable-region-focusable）：
                    Safari 键盘用户无法在没有 tabindex 的滚动容器里滚动。tabIndex 不影响视觉。 */}
                <div tabIndex={0} className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {cityThumbnails.map((city, i) => (
                    <div
                      key={i}
                      className="flex h-12 w-12 flex-shrink-0 rotate-[-4deg] items-center justify-center rounded-full border-2 border-dashed border-travel-bloom/80 bg-travel-parchment dark:border-travel-bloom/50 dark:bg-shell-surface sm:h-14 sm:w-14"
                    >
                      <span className="text-center text-[10px] font-medium leading-tight text-travel-accentStrong dark:text-travel-bloom">
                        {city}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-center text-xs text-travel-ink dark:text-shell-muted">
                  {cityThumbnails.length} 座城市的记忆邮戳
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-white/85 drop-shadow">
              Made with ♥ by 甜途
            </p>

            {/*
              备案号：App 首屏（登录页）即可见的显著位置。
              移动互联网应用程序备案 + 应用商店上架规范要求：编号可见且可点击跳转工信部备案系统。
            */}
            <IcpLicense
              className="mt-2 text-center text-[11px] text-white/70 drop-shadow"
              numberClassName="text-white/85"
              linkClassName="text-white/60"
            />
          </div>
        </div>
      </LoginDoor>

      {showAlbumLock && (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 p-4 backdrop-blur-sm md:flex">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-shell-line dark:bg-shell-surface/95">
            <div className="relative bg-gradient-to-br from-travel-parchment to-travel-parchmentDim p-8 dark:from-[#1E1A1C] dark:to-[#241E22]">
              <button
                type="button"
                onClick={() => {
                  setShowAlbumLock(false)
                  setAlbumPassword('')
                  setAlbumError('')
                }}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-travel-sand/50 transition-colors hover:bg-white/60 hover:text-travel-sand dark:text-travel-sandSoft/60 dark:hover:bg-white/10 dark:hover:text-travel-sandLight"
                aria-label="关闭"
              >
                <Icon icon={X} size="sm" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-travel-sakura to-travel-bloom shadow-lg">
                  <Icon icon={Heart} size="lg" className="fill-white text-white" />
                </div>
                {/* 面板体唯一来源：AlbumUnlockBody（移动端 BottomSheet 同源，文案/结构不允许两份） */}
                <AlbumUnlockBody
                  tone="parchment"
                  password={albumPassword}
                  onPasswordChange={setAlbumPassword}
                  error={albumError}
                  verifying={albumVerifying}
                  onSubmit={handleAlbumUnlock}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 移动端：相册锁 iOS 底部面板（面板体与桌面 Modal 同源：AlbumUnlockBody） */}
      {showAlbumLock && (
        <div className="md:hidden">
          <BottomSheet open onClose={() => {
            setShowAlbumLock(false)
            setAlbumPassword('')
            setAlbumError('')
          }}>
            <div className="flex flex-col items-center px-1 pt-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
                <Icon icon={Heart} size="lg" className="fill-current" />
              </span>
              <AlbumUnlockBody
                tone="sheet"
                password={albumPassword}
                onPasswordChange={setAlbumPassword}
                error={albumError}
                verifying={albumVerifying}
                onSubmit={handleAlbumUnlock}
              />
            </div>
          </BottomSheet>
        </div>
      )}
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#1A1F26]">
          <p className="text-white/60">加载中...</p>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
