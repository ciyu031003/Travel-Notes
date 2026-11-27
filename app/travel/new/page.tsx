'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import TravelComposerForm from '@/components/travel/TravelComposerForm'
import { travelDetailHref } from '@/lib/routes'
import { invalidateTravelListSnapshot } from '@/hooks/use-travel-list'
import './travel-new.css'

/**
 * 移动端新建旅行专用页（独立全屏页面，非弹窗）。
 * 由底部 Dock 栏的「+」与旅行列表页的「＋ 新建旅行」按钮跳入。
 *
 * 创建成功后**直接进入该旅行详情页**（对齐参考产品：建完就进去看，
 * 而不是丢回列表让用户自己找）。
 *
 * ⚠️ 必须走 travelDetailHref() 而不是手拼 /travel/<slug>：
 * 本地壳（APK）是静态导出，www/travel/ 下只有 detail / new / record / placeholder
 * 四个 HTML，**没有** /travel/<slug>。此前这里硬编码拼路径，导致真机
 * 「开始记录」之后落在一个导出里不存在的地址 —— 用户反馈的
 * 「新建完以后没有后续动作、也进不去」的直接根因之一。
 *
 * 视觉（2026-11-27）：整页背景不再是白底板，而是**页面级晚霞云朵**——
 * 两层模糊云 + 颗粒噪点固定在视口后面，上面所有玻璃卡片只是把背景「磨」一下
 * （背景层见 app/glass.css 的 .lg-scene / .lg-clouds，本页的排版见 travel-new.css）。
 * 背景层必须留在页面内容之外（fixed、pointer-events:none），这样滚动时云留在原地，
 * 玻璃才有东西可以折射。
 *
 * ── 页面切换（1.30.18）────────────────────────────────────────────────────
 * App Router 没有跨路由的离场钩子，所以「淡出」必须在**离开本页之前**自己播完：
 *  · 返回 / 创建成功 都先进 leaving 态 —— 卡片反向错峰淡出、整页透明度 260ms 收掉；
 *  · 动画播完（≈240ms）再 router.replace，视觉上是"这一页化开，下一页接管"，
 *    不会出现"点一下白屏闪一下再跳"；
 *  · 只对 opacity 做动画（transform/filter 会给 fixed 的底部 CTA 建新的包含块，
 *    导致它在退场时跳位）；reduced-motion 时 0ms，直接跳。
 */
export default function TravelNewPage() {
  const router = useRouter()
  const reduceMotion = useReducedMotion() === true
  const [leaving, setLeaving] = useState(false)

  /** 先播离场，再真正跳转（返回与创建成功共用同一条路径） */
  const exitThen = useCallback(
    (go: () => void) => {
      if (leaving) return
      setLeaving(true)
      window.setTimeout(go, reduceMotion ? 0 : 240)
    },
    [leaving, reduceMotion],
  )

  return (
    <div className="tn-shell" data-leaving={leaving || undefined}>
      {/* 背景：晚霞 + 两团云。fixed 铺满视口，滚动时不动；纯装饰，读屏忽略 */}
      <div className="tn-scene lg-scene" aria-hidden="true">
        <div className="lg-clouds" />
        <div className="lg-clouds lg-clouds--deep" />
      </div>

      <motion.div
        className="tn-page-fade"
        initial={false}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.4, 0, 1, 1] }}
      >
        <TravelComposerForm
          leaving={leaving}
          onBack={() => exitThen(() => router.replace('/travel'))}
          onCreated={({ slug }) => {
            // 列表快照必须失效：否则「新建 → 进详情 → 返回列表」会命中旧快照，
            // 用户看不到刚建的那本（快照见 hooks/use-travel-list.ts）。
            invalidateTravelListSnapshot()
            exitThen(() => {
              // 本地壳离线新建时也返回本地 slug：详情页会走本地兜底渲染，
              // 不再因为"云端还没有这本旅行"而显示「旅行不存在」。
              router.replace(slug ? travelDetailHref(slug) : '/travel')
            })
          }}
        />
      </motion.div>
    </div>
  )
}
