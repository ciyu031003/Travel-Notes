'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Lock, Mail, ArrowLeft, Eye, EyeOff,
  CheckCircle2, XCircle, KeyRound
} from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { Field } from '@/components/mobile/Field'
import { Button } from '@/components/mobile/Button'
import { apiUrl } from '@/lib/api-base'

type StepType = 'request' | 'verify' | 'reset'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<StepType>('request')

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' })

  const evaluatePassword = (password: string) => {
    if (!password) {
      setPasswordStrength({ score: 0, label: '', color: '' })
      return
    }
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    const levels = [
      { score: 0, label: '', color: '' },
      { score: 1, label: '太弱', color: 'var(--danger-soft)' },
      { score: 2, label: '偏弱', color: 'var(--m-tone-peach-fg)' },
      { score: 3, label: '中等', color: 'var(--m-tone-honey-fg)' },
      { score: 4, label: '强', color: 'var(--m-tone-mint-fg)' },
      { score: 5, label: '非常强', color: 'var(--m-tone-mint-fg)' },
    ]
    setPasswordStrength(levels[Math.min(score, 5)])
  }

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setMessage(null)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: 'error', text: '请输入有效的邮箱地址' })
      return
    }

    setSendingCode(true)
    try {
      const res = await fetch(apiUrl('/api/forgot-password/send-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (res.ok) {
        const data = await res.json()
        setCountdown(60)
        setStep('verify')
        setMessage({
          type: 'success',
          text: data.message || `验证码已发送到 ${email}，请查收`,
        })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '发送失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setSendingCode(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!code || code.length !== 6) {
      setMessage({ type: 'error', text: '请输入 6 位验证码' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/forgot-password/verify-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      })

      if (res.ok) {
        setStep('reset')
        setMessage({ type: 'success', text: '验证码验证成功，请设置新密码' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '验证码错误' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    // 与服务端密码策略（≥8 + 弱口令黑名单，P1-12）保持一致，避免本地校验通过、服务端才报错
    if (!newPassword || newPassword.length < 8) {
      setMessage({ type: 'error', text: '密码至少需要 8 位字符' })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的密码不一致' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/forgot-password/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code,
          newPassword,
        }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: '密码重置成功！即将跳转到登录页面...' })
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '重置失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

// 顶部的三步进度：只做状态提示，不承担跳转（验证码仍由原来的接口流程控制）
  const steps: { key: StepType; label: string }[] = [
    { key: 'request', label: '验证邮箱' },
    { key: 'verify', label: '输入验证码' },
    { key: 'reset', label: '设置密码' },
  ]
  const currentStep = steps.findIndex((s) => s.key === step)
  const strengthColor = passwordStrength.score > 0 ? passwordStrength.color : 'var(--m-line)'

  const eyeButton = (shown: boolean, onToggle: () => void) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--m-faint)] transition-colors active:bg-[var(--m-surface-2)]"
      aria-label={shown ? '隐藏密码' : '显示密码'}
    >
      {shown ? <Icon icon={EyeOff} size="sm" /> : <Icon icon={Eye} size="sm" />}
    </button>
  )

  return (
    <div className="m2-screen min-h-dvh">
      <header className="m2-gutter flex items-center justify-between pb-2 pt-[max(14px,env(safe-area-inset-top))]">
        <Link
          href="/login"
          aria-label="返回登录"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-text)] shadow-[var(--m-shadow-l1)] transition active:scale-95"
        >
          <Icon icon={ArrowLeft} size="md" />
        </Link>
        <span className="text-[13px] font-semibold text-[var(--m-muted)]">账户找回</span>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      <main className="mx-auto w-full max-w-[430px] px-[18px] pb-[max(32px,env(safe-area-inset-bottom))]">
        <div className="pt-5">
          <p className="m2-eyebrow">ACCOUNT RECOVERY</p>
          <h1 className="m2-page-title">找回密码</h1>
          <p className="m2-page-sub">用绑定邮箱验证身份，重新拿回你的甜途记忆。</p>
        </div>

        {/* 三步进度条：与下方表单同一数据源，仅展示当前步骤 */}
        <div className="m2-seg mt-5" role="list" aria-label="找回密码步骤">
          {steps.map((item, index) => (
            <div
              key={item.key}
              role="listitem"
              aria-current={item.key === step ? 'step' : undefined}
              className={`m2-seg-btn flex flex-col items-center justify-center gap-0.5 ${
                index === currentStep ? 'is-active' : 'opacity-65'
              }`}
            >
              <span className="text-[10px] font-bold tabular-nums">STEP {index + 1}</span>
              <span className="text-[12px] font-semibold">{item.label}</span>
            </div>
          ))}
        </div>

        <section className="m2-card mt-4 overflow-hidden">
          <div className="flex items-start gap-3 border-b border-[var(--m-line)] p-5 pb-4">
            <span className="m2-icon-box m2-tone-pink h-12 w-12 shrink-0 [&>svg]:text-[var(--m-accent-strong)]">
              {step === 'request' && <Icon icon={KeyRound} size="lg" />}
              {step === 'verify' && <Icon icon={Mail} size="lg" />}
              {step === 'reset' && <Icon icon={Lock} size="lg" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold tracking-[-0.01em] text-[var(--m-text)]">
                {step === 'request' && '先确认你的邮箱'}
                {step === 'verify' && '查看邮箱验证码'}
                {step === 'reset' && '设置一个新密码'}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--m-muted)]">
                {step === 'request' && '我们会向绑定邮箱发送一次性验证码。'}
                {step === 'verify' && '验证码 10 分钟内有效，请留意收件箱。'}
                {step === 'reset' && '新密码至少 8 位，建议混合字母与数字。'}
              </p>
            </div>
          </div>

          <div className="p-5">
            {message && (
              <div
                role={message.type === 'error' ? 'alert' : 'status'}
                className={`mb-4 flex items-start gap-2 rounded-[12px] border px-3.5 py-3 text-[13px] leading-5 ${
                  message.type === 'success'
                    ? 'border-[color-mix(in_srgb,var(--m-tone-mint-fg)_22%,transparent)] bg-[var(--m-tone-mint-bg)] text-[var(--m-tone-mint-fg)]'
                    : 'border-[color-mix(in_srgb,var(--danger-soft)_24%,transparent)] bg-[color-mix(in_srgb,var(--danger-soft)_10%,white)] text-[var(--danger-soft)]'
                }`}
              >
                {message.type === 'success' ? (
                  <Icon icon={CheckCircle2} size="sm" className="mt-0.5 shrink-0" />
                ) : (
                  <Icon icon={XCircle} size="sm" className="mt-0.5 shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {step === 'request' && (
              <form onSubmit={handleSendCode} className="space-y-4">
                <Field
                  label="邮箱地址"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leadingIcon={Mail}
                  placeholder="请输入绑定的邮箱"
                  autoComplete="email"
                  inputMode="email"
                  hint="如果账号未绑定邮箱，请联系管理员协助重置。"
                />
                <Button
                  type="submit"
                  block
                  size="lg"
                  loading={sendingCode}
                  disabled={sendingCode || countdown > 0}
                >
                  {countdown > 0 ? `${countdown} 秒后可重新发送` : '发送验证码'}
                </Button>
              </form>
            )}

            {step === 'verify' && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <Field
                  label="6 位验证码"
                  required
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="[&_.m-field-input]:text-center [&_.m-field-input]:text-[22px] [&_.m-field-input]:font-bold [&_.m-field-input]:tracking-[0.42em]"
                  hint={`验证码已发送至 ${email}`}
                />
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" block onClick={() => setStep('request')}>
                    返回
                  </Button>
                  <Button type="submit" block loading={loading} disabled={loading}>
                    验证并继续
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendCode()}
                  disabled={sendingCode || countdown > 0}
                  className="mx-auto flex min-h-11 items-center justify-center px-3 text-[13px] font-semibold text-[var(--m-accent-strong)] disabled:text-[var(--m-faint)]"
                >
                  {countdown > 0 ? `${countdown} 秒后可重新发送` : '没收到？重新发送'}
                </button>
              </form>
            )}

            {step === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <Field
                  label="新密码"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    evaluatePassword(e.target.value)
                  }}
                  leadingIcon={Lock}
                  trailing={eyeButton(showPassword, () => setShowPassword((v) => !v))}
                  placeholder="至少 8 位字符"
                  autoComplete="new-password"
                />
                {passwordStrength.score > 0 && (
                  <div className="rounded-[12px] bg-[var(--m-surface-2)] p-3">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 flex-1 rounded-full transition-colors"
                          style={{ background: i <= passwordStrength.score ? strengthColor : 'var(--m-line)' }}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-[12px] text-[var(--m-muted)]">
                      密码强度：<span className="font-bold text-[var(--m-text)]">{passwordStrength.label}</span>
                    </p>
                  </div>
                )}

                <Field
                  label="确认新密码"
                  required
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  leadingIcon={Lock}
                  trailing={eyeButton(showConfirmPwd, () => setShowConfirmPwd((v) => !v))}
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                />

                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="secondary" block onClick={() => setStep('verify')} disabled={loading}>
                    返回
                  </Button>
                  <Button type="submit" block loading={loading} disabled={loading}>
                    重置密码
                  </Button>
                </div>
              </form>
            )}
          </div>
        </section>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 px-4 text-[13px] font-semibold text-[var(--m-muted)] transition-colors hover:text-[var(--m-accent-strong)]"
          >
            <Icon icon={ArrowLeft} size="sm" />
            返回登录
          </Link>
        </div>

        <p className="mt-4 text-center text-[11px] text-[var(--m-faint)]">
          © {new Date().getFullYear()} 甜途 · 把路变成值得记住的故事
        </p>
      </main>
    </div>
  )
}
