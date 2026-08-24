'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'motion/react'
import { User, Lock, Eye, EyeOff, Heart, ArrowLeft, Loader2 } from 'lucide-react'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: [0.23, 1, 0.32, 1] as const } },
}

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

  const inputCls =
    'w-full rounded-xl border border-[#E8DDD4] bg-white/70 py-3 pl-11 pr-11 text-[#3D4852] transition-all placeholder-[#9A958F] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C76E80]/50 dark:border-[#2C343E] dark:bg-[#161B22]/80 dark:text-[#E8E6E1] dark:placeholder-[#6E6A64]'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FAFBF7] p-4 dark:bg-[#121316]">
      {/* 氛围光晕 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#F5DCE0]/70 blur-3xl dark:bg-[#5A3A44]/30" />
        <div className="absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-[#D6E8F0]/80 blur-3xl dark:bg-[#2E3A44]/30" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-[#E8B8C2]/40 blur-3xl dark:bg-[#3A2B31]/40" />
        {/* 漂浮樱花颗粒 */}
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-[#E8B8C2]/50 dark:bg-[#E8B8C2]/20"
            style={{
              left: `${(i * 67) % 100}%`,
              top: `${(i * 41) % 100}%`,
              width: `${6 + (i % 5) * 3}px`,
              height: `${6 + (i % 5) * 3}px`,
              animation: `sakuraFloat ${14 + (i % 7) * 3}s linear infinite`,
              animationDelay: `-${i * 2.3}s`,
            }}
          />
        ))}
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full max-w-md"
      >
        <motion.div
          variants={item}
          className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-8 shadow-[0_30px_80px_rgba(90,102,112,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#16181C]/90"
        >
          {/* 顶部渐变条 */}
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#F5DCE0] via-[#E8B8C2] to-[#A8C8DC]" />

          <motion.div variants={item} className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-travel-accentSoft via-pink-500 to-orange-300 shadow-lg shadow-travel-accent/25">
              <Heart className="h-8 w-8 text-white" fill="currentColor" />
            </div>
            <h1 className="text-2xl font-bold text-[#2D3842] dark:text-[#F1EFEA]">行迹 · 后台管理</h1>
            <p className="mt-2 text-sm text-[#5A6670] dark:text-[#9BA3AE]">行迹 · 从这里开始打理</p>
          </motion.div>

          <motion.form variants={item} onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#5A6670] dark:text-[#9BA3AE]">用户名</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A958F]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputCls}
                  placeholder="请输入用户名"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#5A6670] dark:text-[#9BA3AE]">密码</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A958F]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
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
              <motion.div
                key={error}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl border border-[#E8B8C2]/50 bg-[#F5DCE0]/40 px-4 py-3 text-sm text-[#A64E61] dark:border-[#5A3A44] dark:bg-[#3A2B31]/70 dark:text-[#E8B8C2]"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.015 }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#A64E61] to-[#C76E80] py-3.5 font-semibold text-white shadow-lg shadow-[#A64E61]/25 transition-all hover:shadow-xl disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '登 录'}
            </motion.button>
          </motion.form>

          <motion.div variants={item} className="mt-6 flex items-center justify-center gap-6 text-sm">
            {needsSetup && (
              <Link href="/admin/setup" className="text-[#A64E61] transition-colors hover:text-[#8B3A4C] underline underline-offset-4 dark:text-[#E8B8C2]">
                首次使用？初始化管理员
              </Link>
            )}
            <Link href="/" className="inline-flex items-center gap-1 text-[#5A6670] transition-colors hover:text-[#A64E61] dark:text-[#9BA3AE] dark:hover:text-[#E8B8C2]">
              <ArrowLeft className="h-3.5 w-3.5" />
              返回首页
            </Link>
          </motion.div>
        </motion.div>

        <motion.p variants={item} className="mt-6 text-center text-xs text-[#9A958F] dark:text-[#6E6A64]">
          Made with ♥ by 袁同学 & 阿比旦
        </motion.p>
      </motion.div>
    </div>
  )
}

