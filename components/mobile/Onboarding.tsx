'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Map, Images, Footprints, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticLight, hapticSuccess } from '@/lib/mobile/haptics'
import { Icon } from './Icon'
import { IconBadge } from './IconBadge'
import type { LucideIcon } from 'lucide-react'
import type { BadgeTone } from '@/lib/mobile/icon-system'

/**
 * 首次启动引导（3 屏）
 * ---------------------------------------------------------------------------
 * 目标（对应用户要求"上手 APP 就知道是干什么用的"）：
 *   新用户首次打开时，用 3 句话说清产品是什么 —— 不介绍功能清单，只讲
 *   "你能得到什么"：记录旅程 → 点亮地图 → 得到一本画册。
 *
 * 设计约定：
 *   · 仅移动端展示（桌面 Web 不受影响，走 md:hidden 隔离）
 *   · 只显示一次，写 localStorage
 *   · 图标统一走 Icon / IconBadge（暖色圆润），尺寸锁死
 *   · 无装饰光斑、无无限动画
 */

export const ONBOARD_STORAGE_KEY = 'tiantu-onboard-seen-v1'
export const ONBOARD_DONE_EVENT = 'tiantu:onboarding-done'
const STORAGE_KEY = ONBOARD_STORAGE_KEY

interface Slide {
  icon: LucideIcon
  tone: BadgeTone
  eyebrow: string
  title: string
  desc: string
}

const SLIDES: Slide[] = [
  {
    icon: Footprints,
    tone: 'clay',
    eyebrow: 'STEP 01 · 记录',
    title: '把每次出发\n留下来',
    desc: '按天写下行程与心情，照片随手放进来。一次旅行，就是一叠不会散的记忆。',
  },
  {
    icon: Map,
    tone: 'accent',
    eyebrow: 'STEP 02 · 足迹',
    title: '走过的省份\n在地图上亮起',
    desc: '中国地图会记住你去过哪里。点亮一座城，就是给自己盖一枚邮戳。',
  },
  {
    icon: Images,
    tone: 'sun',
    eyebrow: 'STEP 03 · 画册',
    title: '照片会自动\n变成一本画册',
    desc: '每个城市一本，翻开来是书页，合上是记下的日子。随时可以分享给 TA。',
  },
]

export function Onboarding() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState(0)

  // 只在「首页」首次进入时展示。
  // 为什么不做全局展示：本组件是全屏模态，若挂在所有路由上，任何深链首次打开
  // 都会被它挡住（如他人分享的 /travel/xxx、或 /travel?compose=1 记录流程），
  // 用户必须先关掉引导才能看到目标内容。E2E 冒烟也正是被这一点拦停。
  const isHome = pathname === '/'

  // 首帧不渲染，避免 SSR/水合不一致
  useEffect(() => {
    if (!isHome) return
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return
    } catch {
      return
    }
    setVisible(true)
  }, [isHome])

  const close = (done: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {}
    if (done) void hapticSuccess()
    setVisible(false)
    // 通知"下一个一次性弹层"（偏好问卷）可以上场了 —— 两个全屏模态不该叠加
    try {
      window.dispatchEvent(new CustomEvent(ONBOARD_DONE_EVENT))
    } catch {}
  }

  const nextSlide = () => {
    void hapticLight()
    if (index >= SLIDES.length - 1) {
      close(true)
      return
    }
    setIndex((i) => i + 1)
  }

  if (!visible) return null

  const slide = SLIDES[index]
  const isLast = index === SLIDES.length - 1

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--m-bg)] text-[var(--m-text)] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="首次使用引导"
    >
      {/* 跳过 */}
      <div className="flex justify-end p-4 pt-[max(16px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => close(false)}
          className="m-pressable flex h-11 items-center gap-1 rounded-full px-3 text-[var(--m-muted)]"
          aria-label="跳过引导"
        >
          <span className="m-caption">跳过</span>
          <Icon icon={X} size="sm" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <IconBadge icon={slide.icon} tone={slide.tone} size="lg" shape="circle" className="h-20 w-20" />

        <p className="m-label mt-8 text-[var(--m-accent-strong)]">{slide.eyebrow}</p>
        <h2 className="m-display mt-3 whitespace-pre-line">{slide.title}</h2>
        <p className="m-body mt-4 max-w-[300px] text-[var(--m-muted)]">{slide.desc}</p>
      </div>

      {/* 底部：指示点 + 主行动 */}
      <div className="px-8 pb-[max(28px,env(safe-area-inset-bottom))]">
        <div className="mb-6 flex items-center justify-center gap-2" aria-hidden="true">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === index ? 'w-6 bg-[var(--m-accent)]' : 'w-1.5 bg-[var(--m-faint)]',
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={nextSlide}
          className="m-press m-body flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--m-accent)] py-4 font-semibold text-white"
        >
          {isLast ? '开始记录' : '下一步'}
          {!isLast && <Icon icon={ChevronRight} size="sm" />}
        </button>

        <p className="m-caption mt-4 text-center text-[var(--m-muted)]">
          第 {index + 1} / {SLIDES.length} 步
        </p>
      </div>
    </div>
  )
}

export default Onboarding
