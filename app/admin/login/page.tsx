'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'motion/react'
import { User, Lock, Eye, EyeOff, Heart, ArrowLeft } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { Field } from '@/components/mobile/Field'
import { Button } from '@/components/mobile/Button'

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    fetch('/api/admin/check')
      .then((res) => res.json())
      .then((data) => {
        if (data.needsSetup) setNeedsSetup(true)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.requirePasswordChange) {
          router.push('/admin/change-password')
        } else {
          router.push('/admin')
        }
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

  return (
    <div className="m2-screen relative flex min-h-dvh items-center justify-center overflow-hidden px-[18px] py-10">
      {/* 樱粉 / 蜜桃 / 薄荷柔光，保持后台与前台同一套糖果色温 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[var(--m-tone-pink)] blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-[26rem] w-[26rem] rounded-full bg-[var(--m-tone-mint-bg)] blur-3xl" />
        <div className="absolute left-1/2 top-1/4 h-64 w-64 -translate-x-1/2 rounded-full bg-[var(--m-tone-peach-bg)] opacity-70 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[400px]"
      >
        <header className="mb-5 flex items-center gap-3">
          <span className="m2-icon-box m2-tone-pink h-12 w-12 rounded-[15px]">
            <Icon icon={Heart} size="lg" className="fill-current" />
          </span>
          <div className="min-w-0">
            <p className="m2-eyebrow">ADMIN STUDIO</p>
            <p className="mt-0.5 text-[22px] font-bold tracking-[-0.03em] text-[var(--m-text)]">甜途 · 后台</p>
          </div>
        </header>

        <section className="m2-card p-5">
          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--m-text)]">后台管理登录</h1>
          <p className="mt-1 text-[12px] leading-5 text-[var(--m-muted)]">打理旅程、相册与旅行圈内容。</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field
              label="用户名"
              required
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              leadingIcon={User}
              placeholder="请输入管理员用户名"
              autoComplete="username"
              autoFocus
            />

            <Field
              label="密码"
              required
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leadingIcon={Lock}
              placeholder="请输入管理员密码"
              autoComplete="current-password"
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

            {error && (
              <div role="alert" className="rounded-[12px] bg-[color-mix(in_srgb,var(--danger-soft)_10%,white)] px-3.5 py-3 text-[13px] leading-5 text-[var(--danger-soft)]">
                {error}
              </div>
            )}

            <Button type="submit" block size="lg" loading={loading} disabled={loading}>
              登录后台
            </Button>
          </form>

          <div className="mt-4 flex flex-col items-center gap-1 border-t border-[var(--m-line)] pt-3">
            {needsSetup && (
              <Link
                href="/admin/setup"
                className="flex min-h-11 items-center px-2 text-[12px] font-bold text-[var(--m-accent-strong)]"
              >
                首次使用？初始化管理员
              </Link>
            )}
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[12px] font-semibold text-[var(--m-muted)]"
            >
              <Icon icon={ArrowLeft} size="sm" />
              返回首页
            </Link>
          </div>
        </section>

        <p className="mt-4 text-center text-[11px] text-[var(--m-faint)]">Made with ♥ by 甜途</p>
      </motion.div>
    </div>
  )
}
