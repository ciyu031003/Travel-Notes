'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, ArrowRight, X, Heart, UserRound } from 'lucide-react'
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
// 桌面端（≥1024）登录页专属皮肤：暖象牙玻璃面板（只包登录列，不覆盖整屏视频）
import './web-login.css'

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

  return (
    <>
﻿      <LoginDoor>
        {/* id=main-content：app/layout 的「跳到主内容」链接在登录页也要有落点
            （Lighthouse skip-link 审计：登录页自成一体，没有 LayoutContent 的 main） */}
        <div
          id="main-content"
          className="flex min-h-dvh items-center justify-center px-[18px] pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] md:py-10 lg:py-2"
        >
          <div className="web-login-column w-full max-w-[430px]">
            <div className="web-login-panel">
              {/* 桌面专属：Ink & Ivory 细眉（<1024 不渲染，移动端视觉不变） */}
              <div className="web-login-eyebrow-row hidden lg:flex" aria-hidden="true">
                <span className="web-login-eyebrow">Travel Notes</span>
                <span className="web-login-eyebrow-rule" />
                <span className="web-login-eyebrow-dot" />
              </div>
              {/* 登录页的一级标题：既是页面语义标题，也是登录页 a11y/E2E 的稳定锚点
                  （此前登录页没有 h1；文案沿用「登录你的旅行记忆空间」，视觉上不占版面） */}
              <h1 className="sr-only">登录你的旅行记忆空间</h1>
              <header className="mb-5 flex items-center gap-3">
                <BrandLogo size={46} rounded="rounded-[16px]" />
                {/* <1024 时这里是直接压在视频上的文字块：web-login.css 给它一块局部玻璃铭牌
                    （与页脚同款，只包文字、不覆盖视频），≥1024 在面板内则完全不加样式 */}
                <div className="web-login-head-plate min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="web-login-brand-title web-login-onscreen text-[23px] font-bold tracking-[-0.03em] text-[var(--m-text)]">甜途</p>
                    {isAuthed && (
                      <Link
                        href="/"
                        className="rounded-full bg-[var(--m-tone-mint-bg)] px-2.5 py-1 text-[10px] font-bold text-[var(--m-tone-mint-fg)]"
                      >
                        已登录 · 进入空间
                      </Link>
                    )}
                  </div>
                  <p className="web-login-tagline web-login-onscreen mt-0.5 truncate text-[12px] text-[var(--m-muted)]">把走过的路，变成值得记住的故事。</p>
                </div>
              </header>

              <div className="m2-card rounded-[22px] p-5 shadow-[0_24px_70px_-24px_rgba(74,20,43,0.45)] backdrop-blur-2xl">
                <div className="m2-seg mb-5" role="tablist" aria-label="登录或注册">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'login'}
                    onClick={() => switchMode('login')}
                    className={`m2-seg-btn ${mode === 'login' ? 'is-active' : ''}`}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'register'}
                    onClick={() => switchMode('register')}
                    className={`m2-seg-btn ${mode === 'register' ? 'is-active' : ''}`}
                  >
                    注册
                  </button>
                </div>

                <form onSubmit={mode === 'login' ? handleSubmit : handleRegister} className="space-y-4">
                  <Field
                    label="用户名"
                    required
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    leadingIcon={UserRound}
                    placeholder="请输入用户名"
                    autoComplete="username"
                    name="username"
                  />

                  <Field
                    label="密码"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    leadingIcon={Lock}
                    placeholder={mode === 'login' ? '请输入密码' : '至少 8 位字符'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    name="password"
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--m-faint)] transition-colors active:bg-[var(--m-surface-2)]"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      >
                        {showPassword ? <Icon icon={EyeOff} size="sm" /> : <Icon icon={Eye} size="sm" />}
                      </button>
                    }
                  />

                  {mode === 'register' && (
                    <Field
                      label="确认密码"
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      leadingIcon={Lock}
                      placeholder="请再次输入密码"
                      autoComplete="new-password"
                      name="confirmPassword"
                    />
                  )}

                  {error && (
                    <div role="alert" className="flex items-start gap-2 rounded-[12px] bg-[color-mix(in_srgb,var(--danger-soft)_10%,white)] px-3.5 py-3 text-[13px] leading-5 text-[var(--danger-soft)]">
                      <Icon icon={X} size="sm" className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-5 w-5 rounded accent-[var(--m-accent)]"
                      />
                      <span className="text-[12px] text-[var(--m-muted)]">记住我 (5小时)</span>
                    </label>
                    <Link
                      href="/forgot-password"
                      className="flex min-h-11 items-center px-1 text-[12px] font-bold text-[var(--m-accent-strong)]"
                    >
                      忘记密码？
                    </Link>
                  </div>

                  <Button
                    type="submit"
                    block
                    size="lg"
                    icon={ArrowRight}
                    iconPosition="trailing"
                    loading={mode === 'login' ? loading : isRegistering}
                    disabled={loading || isRegistering}
                  >
                    {mode === 'login' ? '登录并进入' : '注册并进入'}
                  </Button>
                </form>

                <div className="my-4 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-[var(--m-line)]" />
                  <span className="text-[10px] font-semibold tracking-[0.12em] text-[var(--m-faint)]">OR</span>
                  <span className="h-px flex-1 bg-[var(--m-line)]" />
                </div>

                <Button type="button" block variant="secondary" icon={Lock} onClick={() => setShowAlbumLock(true)}>
                  相册解锁
                </Button>

                <div className="mt-4 rounded-[16px] bg-[var(--m-surface-2)] p-3">
                  <div tabIndex={0} className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                    {cityThumbnails.map((city, i) => (
                      <span
                        key={i}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--m-line-strong)] bg-[var(--m-surface-solid)] text-[10px] font-semibold text-[var(--m-accent-strong)]"
                      >
                        {city}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-center text-[11px] text-[var(--m-faint)]">
                    {cityThumbnails.length} 座城市的记忆邮戳
                  </p>
                </div>
              </div>

              {/*
                页脚（版权 + 备案号）：直接压在明亮视频上，原样式在亮/暗两套下都读不清。
                <1024 由 .web-login-footer 提供一块**局部**深色玻璃铭牌（只包住这两行，
                不是整屏遮罩）；≥1024 它在暖象牙玻璃面板内，改用墨色小字提高对比度。
              */}
              <div className="web-login-footer">
                <p className="web-login-onscreen mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[var(--m-muted)]">
                  Made with <Icon icon={Heart} size="sm" className="fill-current text-[var(--m-accent)]" /> by 甜途
                </p>

                {/* 备案号：App 首屏（登录页）即可见的显著位置 */}
                <IcpLicense
                  className="web-login-onscreen mt-1 text-center text-[10px] text-[var(--m-faint)]"
                  numberClassName="text-[var(--m-muted)]"
                  linkClassName="text-[var(--m-faint)]"
                />
              </div>
            </div>
          </div>
        </div>
      </LoginDoor>

      {showAlbumLock && (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-[rgba(58,20,36,0.42)] p-4 backdrop-blur-[3px] md:flex">
          <div className="m2-card w-full max-w-sm overflow-hidden rounded-[24px] border-white/70 bg-[rgba(255,250,252,0.98)] shadow-[0_30px_80px_-24px_rgba(58,20,36,0.5)]">
            <div className="relative p-7">
              <button
                type="button"
                onClick={() => {
                  setShowAlbumLock(false)
                  setAlbumPassword('')
                  setAlbumError('')
                }}
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--m-surface-2)] text-[var(--m-muted)] transition active:scale-95"
                aria-label="关闭"
              >
                <Icon icon={X} size="md" />
              </button>

              <div className="flex flex-col items-center text-center">
                <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--m-tone-pink)] text-[var(--m-accent-strong)]">
                  <Icon icon={Heart} size="lg" className="fill-current" />
                </span>
                {/* 面板体唯一来源：AlbumUnlockBody（移动端 BottomSheet 同源，文案/结构不允许两份） */}
                <AlbumUnlockBody
                  tone="sheet"
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
        <div className="m2-screen flex min-h-dvh items-center justify-center">
          <p className="text-[13px] text-[var(--m-muted)]">加载中...</p>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
