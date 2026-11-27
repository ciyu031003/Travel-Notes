'use client'

import { useEffect, useState } from 'react'

/**
 * 书本开合三段式（2026-11-28 · U3）
 * ---------------------------------------------------------------------------
 * 「封面合上 → 翻开」不是一步淡入，而是一本真书被打开的三段动作：
 *
 *   ① 封面上抬 / 侧倾：封面先离开书芯（translateZ + 一次轻微反向 13°），
 *      再绕左侧书脊转到 -158°——「立起来」的重量感来自这一下反向。
 *   ② 扉页扫入：内页纸（.book-choreo__flyleaf）从左侧落下，一道斜光扫过纸面。
 *   ③ 内页展开：阅读器本体（page-flip）从 0.968 缩放回到 1 并淡入。
 *
 * 关闭时完全逆向：内页先塌（.book-reader[data-choreo='closing'] 负责），
 * 扉页翻回，封面合上，纸幕淡入后调用 onClosed 交还给画册墙。
 *
 * 分工（重要）：
 *   · 本组件只负责**编排相位**（什么时候切 class / 什么时候结束）；
 *   · 所有位移、旋转、阴影都在 app/album-motion.css 的 .book-choreo* 里，
 *     命中 data-phase 的 CSS 动画，React 不在动画期间重渲染（只切一次 data-phase）；
 *   · 视觉只动 transform / opacity；三层纸页厚度是 box-shadow + 伪元素，动画期间不重绘。
 *
 * 无障碍：reduced（prefers-reduced-motion / 视觉档 reduced）时不做任何位移与旋转，
 * 退化为一次淡入淡出（CSS 里同样有 @media 兜底），相位时长也一并缩短。
 */

export interface ChoreographyCover {
  title: string
  /** 副标题：地点 / 一句话 */
  subtitle?: string | null
  /** 日期文案（已格式化） */
  dateLabel?: string | null
  /** 封面图（缩略图优先） */
  coverSrc?: string | null
}

/** 开启：CSS 收尾（580ms + 300ms）之后留一点余量再交还交互 */
const OPEN_DONE_MS = 920
/** 关闭：封面合上 500ms 后交还 */
const CLOSE_DONE_MS = 560
/** reduced：只做淡入淡出 */
const REDUCED_OPEN_MS = 220
const REDUCED_CLOSE_MS = 240

export default function BookOpenChoreography({
  cover,
  closing = false,
  reduced = false,
  onOpened,
  onClosed,
}: {
  cover: ChoreographyCover
  /** true = 走关闭（逆向）动画；进入时就该是 true（覆盖层要在关闭前挂载） */
  closing?: boolean
  reduced?: boolean
  onOpened?: () => void
  onClosed?: () => void
}) {
  const [phase, setPhase] = useState<'opening' | 'closing'>(closing ? 'closing' : 'opening')

  // 开启：动画跑完通知调用方卸载覆盖层
  useEffect(() => {
    if (closing) return
    const timer = setTimeout(() => onOpened?.(), reduced ? REDUCED_OPEN_MS : OPEN_DONE_MS)
    return () => clearTimeout(timer)
  }, [closing, reduced, onOpened])

  // 关闭：封面合上后通知调用方真正退出阅读器
  useEffect(() => {
    if (!closing) return
    setPhase('closing')
    const timer = setTimeout(() => onClosed?.(), reduced ? REDUCED_CLOSE_MS : CLOSE_DONE_MS)
    return () => clearTimeout(timer)
  }, [closing, reduced, onClosed])

  const meta = [cover.dateLabel, cover.subtitle].filter(Boolean).join(' · ')
  const initial = (cover.title || '行').trim().charAt(0)

  return (
    <div
      className={'book-choreo' + (reduced ? ' book-choreo--reduced' : '')}
      data-phase={phase}
      data-reduced={reduced ? '1' : '0'}
      role="presentation"
      aria-hidden="true"
    >
      {/* 全屏纸幕：开启时淡出 / 关闭时淡入，是"书"与"阅读器"之间的交叉过渡层 */}
      <div className="book-choreo__veil" />

      <div className="book-choreo__stage">
        {/* 书芯：两层伪元素当纸厚（右侧/下方露出的白色叠边） */}
        <div className="book-choreo__board" />
        <div className="book-choreo__pages" />
        {/* 扉页：从左侧落下 + 扫光。印着书名，翻开时"先看到扉页，再看到内页" */}
        <div className="book-choreo__flyleaf">
          <div className="book-choreo__flyleaf-text">
            <span className="book-choreo__flyleaf-rule" />
            <span className="book-choreo__flyleaf-kicker">TRAVEL NOTES</span>
            <span className="book-choreo__flyleaf-title">{cover.title}</span>
            {meta ? <span className="book-choreo__flyleaf-meta">{meta}</span> : null}
            <span className="book-choreo__flyleaf-rule" />
          </div>
        </div>

        {/* 封面：绕左书脊旋转 */}
        <div className="book-choreo__cover">
          <div className="book-choreo__spine" />
          <div className={'book-choreo__cover-art' + (cover.coverSrc ? '' : ' book-choreo__cover-art--empty')}>
            {cover.coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.coverSrc} alt="" loading="eager" decoding="async" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className="book-choreo__cover-text">
            <span className="book-choreo__cover-kicker">TRAVEL BOOK</span>
            <span className="book-choreo__cover-title">{cover.title}</span>
            {meta ? <span className="book-choreo__cover-meta">{meta}</span> : null}
          </div>
          <div className="book-choreo__cover-sheen" />
        </div>
      </div>
    </div>
  )
}
