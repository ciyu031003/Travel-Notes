'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react'
import { ChevronLeft, ChevronRight, Image as ImageIcon, Images, Maximize2 } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import RemoteImage from '@/components/mobile/RemoteImage'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 堆叠相册 · 3D 卡片牌堆（2026-11-24）
 * ============================================================================
 * 需求（真机反馈）："点开旅行记录时，最上方用堆叠效果显示所有图片，手指左右滑动就能
 * 直接切换查看" —— 把社区卡片牌堆那套拖拽动效搬进相册。
 *
 * 与旧 StackedGallery 的区别：
 *   · 旧版是「三态平移动画」（active / peek / leave），一次只在屏幕上看到 1.5 张；
 *   · 新版是**真牌堆**：所有照片以卡片形式叠在一起（带 3D 倾斜），顶卡可拖拽，
 *     左右滑过阈值就把顶卡「送到底部」（send to back），下一张顺势放大到顶 ——
 *     滑动方向有语义：向左＝下一张，向右＝上一张。
 *
 * 三层结构（性能优先，牌堆再深也不拖滞）：
 *   1) 牌堆容器：固定 4:5（与旧版一致，父级 .circle-story-stack 负责"纸面"外框）；
 *   2) 每张卡：absolute inset-0，按深度给 rotateZ / scale / 微抖动（牌堆扇形）；
 *   3) 只有顶卡挂 drag + 3D 倾斜（rotateX/rotateY 由拖拽位移驱动，松手回弹），
 *      其余卡 pointer-events-none，不参与命中与合成。
 *
 * 为什么最多只挂 maxVisible 张：一场旅行可能 30+ 张照片，全部挂 motion 节点会让
 * 首帧合成变重（真机 4× 降速下能明显看出掉帧）。牌堆视觉上只需要 4~5 层，
 * 所以只渲染顶部的 N 张，送到底部的卡自然落到渲染窗口外 —— 数据仍完整循环。
 *
 * 图片：走 RemoteImage 的 -preview 变体（顶两张）/ -thumbnail（更深的卡），
 * 原图只在打开全屏查看器时才拉（与旧堆叠相册的下标数组保持一致，不会错位）。
 */

export interface PhotoDeckProps {
  /** 照片 URL（与全屏查看器共用同一数组，下标必须一致） */
  images: string[]
  /** 图片替代文本前缀（通常传帖子标题） */
  alt: string
  className?: string
  /** 点击顶卡（父级通常打开全屏查看器） */
  onOpen?: (index: number) => void
  /** 横向拖过多少像素算切换，默认 76 */
  sensitivity?: number
  /** 最多同时挂载几张卡（性能阀），默认 5 */
  maxVisible?: number
}

/** 切换阈值兜底：即使位移不够，快速甩动也认 */
const VELOCITY_THRESHOLD = 520
/** 牌堆扇形：每深一层多倾斜的角度 */
const DEPTH_TILT = 4
/** 每深一层缩小的比例 */
const DEPTH_SCALE = 0.05
/** 顶卡拖拽时的 3D 倾斜幅度（角度） */
const TILT_X = 9
const TILT_Y = 12

export default function PhotoDeck({
  images,
  alt,
  className,
  onOpen,
  sensitivity = 76,
  maxVisible = 5,
}: PhotoDeckProps) {
  const reduceMotion = useReducedMotion()
  const total = images.length
  /** 牌堆顺序：index 0 = 最底下，最后一个 = 顶卡 */
  // 初始牌堆：最后一张排在数组末尾 = 顶卡，所以倒着放 —— 打开时第一张照片在最上面
  const [order, setOrder] = useState<number[]>(() => images.map((_, i) => i).reverse())
  /** 顶卡拖拽位移（由父级持有，换顶卡时直接归零，避免残影） */
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-120, 120], [TILT_X, -TILT_X])
  const rotateY = useTransform(x, [-120, 120], [-TILT_Y, TILT_Y])

  // 图片列表变化（切换帖子 / 编辑后增删图）：重建牌堆并归位
  const signature = useMemo(() => images.join('|'), [images])
  useEffect(() => {
    setOrder(images.map((_, i) => i).reverse())
    x.set(0)
    y.set(0)
    // images 长度由 signature 覆盖；此处只依赖签名，避免每次渲染重排
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const topIndex = order.length > 0 ? order[order.length - 1] : 0
  /**
   * 顶卡下标的 ref：换牌后旧顶卡的 onClick 闭包可能还留在 DOM 上（动画期间），
   * 直接读闭包里的 topIndex 会「点第 1 张却打开第 2 张」。点击一律读 ref 的实时值。
   */
  const topIndexRef = useRef(topIndex)
  topIndexRef.current = topIndex

  /** 向前一张：顶卡送到牌堆底部（新顶卡 = 原来下面那张） */
  const next = useCallback(() => {
    setOrder((prev) => (prev.length <= 1 ? prev : [prev[prev.length - 1], ...prev.slice(0, -1)]))
  }, [])

  /** 向后一张：把最底下的卡抽到顶部（与 next 互为逆操作） */
  const prev = useCallback(() => {
    setOrder((prev) => (prev.length <= 1 ? prev : [...prev.slice(1), prev[0]]))
  }, [])

  const go = useCallback(
    (dir: 1 | -1) => {
      if (total <= 1) return
      void hapticLight()
      // 先归零位移再换牌：否则被换下去的那张会带着拖拽偏移留在牌堆里
      x.set(0)
      y.set(0)
      if (dir === 1) next()
      else prev()
    },
    [next, prev, total, x, y],
  )

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const fast = Math.abs(info.velocity.x) > VELOCITY_THRESHOLD
      if (total <= 1) return
      if (info.offset.x <= -sensitivity || (fast && info.velocity.x < 0)) go(1)
      else if (info.offset.x >= sensitivity || (fast && info.velocity.x > 0)) go(-1)
      // 未过阈值：交给 motion 的 dragConstraints 自动回弹（不手动 set，避免硬跳）
    },
    [go, sensitivity, total],
  )

  const openTop = useCallback(() => {
    void hapticLight()
    onOpen?.(topIndexRef.current)
  }, [onOpen])

  /**
   * 「点一下看图」自己判定，不依赖 motion 的 click 合成：
   * pointerdown → pointerup 位移 < 8px 且 < 600ms 才算点（否则是拖拽/滑动）。
   * 历史坑：① 用 onClick + 拖拽后"吞点击"标记，会把滑动之后的每一次点击都吞掉；
   * ② 换牌后旧顶卡的闭包还挂在 DOM 上，会打开上一张 —— 所以下标一律读 ref 实时值。
   */
  const tapRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    tapRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const tap = tapRef.current
    if (!tap) return
    if (Math.abs(e.clientX - tap.x) > 8 || Math.abs(e.clientY - tap.y) > 8) tap.moved = true
  }
  const onPointerUp = () => {
    const tap = tapRef.current
    tapRef.current = null
    if (!tap || tap.moved) return
    if (Date.now() - tap.t > 600) return
    // 从卡片上抬起手指才会落到这里；按钮自己 stopPropagation
    openTop()
  }

  // 键盘可达（桌面 / 外接键盘）：左右方向键切图
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(-1)
    }
  }

  if (total === 0) return null

  const visible = order.slice(Math.max(0, order.length - maxVisible))

  return (
    <div className={cn('relative select-none', className)} data-no-swipeback>
      <div
        role="group"
        aria-roledescription="堆叠相册"
        aria-label={alt ? alt + ' 照片' : '旅行照片'}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative aspect-[4/5] w-full touch-pan-y outline-none"
        style={{ perspective: 1000 }}
      >
        {visible.map((photoIndex, visIndex) => {
          const depth = visible.length - 1 - visIndex
          const isTop = depth === 0
          // 稳定的"手气"抖动：同一张照片每次渲染角度一致（不要用 Math.random，否则重排会跳）
          const jitter = ((photoIndex * 37) % 7) - 3
          const tilt = depth * DEPTH_TILT + jitter
          const scale = 1 - depth * DEPTH_SCALE

          return (
            <motion.div
              key={photoIndex}
              className="absolute inset-0"
              style={{ zIndex: 40 - depth, transformOrigin: '90% 90%' }}
              animate={{ rotateZ: isTop || reduceMotion ? 0 : tilt, scale: isTop ? 1 : scale }}
              initial={false}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              {/*
                为什么拖拽层与「牌堆位置层」分开：动画属性（rotateZ/scale）和拖拽位移（x/y）
                放在同一个 motion 节点上时，animate 每帧会重算整条 transform，把拖拽位移吃掉
                —— 实测顶卡拖不动。拆两层后各管一段 transform，drag 才真正跟手。
              */}
              {isTop ? (
                <motion.div
                  className="relative h-full w-full cursor-grab overflow-hidden rounded-2xl ring-1 ring-[var(--ui-social-line)] bg-[var(--ui-social-surface2)]"
                  style={{
                    x,
                    y,
                    rotateX: reduceMotion ? 0 : rotateX,
                    rotateY: reduceMotion ? 0 : rotateY,
                    transformPerspective: 900,
                  }}
                  drag
                  dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  dragElastic={0.62}
                  dragMomentum={false}
                  onDragEnd={handleDragEnd}
                  whileTap={{ cursor: 'grabbing' }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => { tapRef.current = null }}
                  aria-label={'查看第 ' + (topIndex + 1) + ' 张图片'}
                  aria-roledescription="照片卡"
                >
                  <RemoteImage
                    src={images[photoIndex]}
                    alt={(alt ? alt + ' ' : '') + '第 ' + (photoIndex + 1) + ' 张'}
                    variant="preview"
                    fill
                    priority
                  />
                </motion.div>
              ) : (
                <div className="relative h-full w-full overflow-hidden rounded-2xl ring-1 ring-[var(--ui-social-line)] bg-[var(--ui-social-surface2)]">
                  <RemoteImage
                    src={images[photoIndex]}
                    alt={(alt ? alt + ' ' : '') + '第 ' + (photoIndex + 1) + ' 张'}
                    variant={depth <= 2 ? 'preview' : 'thumbnail'}
                    fill
                  />
                  {/* 深层的卡：压一层纸感暗角，视觉上把牌堆压出层次（顶卡不加，保证照片原色） */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-black/10"
                    style={{ opacity: Math.min(0.45, depth * 0.18) }}
                  />
                </div>
              )}
            </motion.div>
          )
        })}

        {/* 计数徽标（与旧堆叠相册一致的位置/样式） */}
        {total > 1 && (
          <div className="pointer-events-none absolute right-3 top-3 z-50 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <Icon icon={Images} size="sm" />
            {topIndex + 1} / {total}
          </div>
        )}

        {/* 手势提示 + 明确的"看大图"入口（按钮比"点照片"可靠，也不会与拖拽抢手势） */}
        {total > 1 && (
          <div className="absolute inset-x-0 bottom-3 z-50 flex items-center justify-center gap-2 px-3">
            <span className="pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md">
              <Icon icon={ChevronLeft} size="sm" />
              左右滑动切换
              <Icon icon={ChevronRight} size="sm" />
            </span>
            <button
              type="button"
              aria-label="查看大图"
              onClick={(e) => {
                e.stopPropagation()
                openTop()
              }}
              className="m-press inline-flex items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md"
            >
              <Icon icon={Maximize2} size="sm" />
              看大图
            </button>
          </div>
        )}

        {/* 桌面 / 大屏：显式前后按钮（移动端主要走手势，避免遮挡照片） */}
        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              onClick={(e) => { e.stopPropagation(); go(-1) }}
              className="m-press absolute left-3 top-1/2 z-50 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md sm:flex"
            >
              <Icon icon={ChevronLeft} size="md" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              onClick={(e) => { e.stopPropagation(); go(1) }}
              className="m-press absolute right-3 top-1/2 z-50 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md sm:flex"
            >
              <Icon icon={ChevronRight} size="md" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** 空相册占位（父级判断长度时用得上，保持和旧组件同一个图标语言） */
export function PhotoDeckEmpty() {
  return (
    <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-[var(--ui-social-surface2)] text-[var(--ui-social-muted)]">
      <Icon icon={ImageIcon} size="lg" />
      <span className="text-[13px] font-medium">还没有照片</span>
    </div>
  )
}