'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { deriveVariantUrl, variantChain, type MediaVariant } from '@/lib/media/variant-url'
import { isLocalMediaUsable, useLocalMediaSource } from '@/hooks/use-local-media-url'

/**
 * 移动端图片渲染（性能专项 E3 + P4 本地优先）：**本地文件优先** + 变体 + 懒加载 + 模糊占位 + 逐级回退。
 *
 * 为什么不用 next/image：移动壳是**静态导出**（MOBILE_EXPORT=1 → images.unoptimized），
 * 壳内 next/image 只是把原图 URL 原样丢给 <img>；而原图单张 8–10MB，弱网下等于白屏。
 * 这里直接渲染服务端三级变体（-thumbnail/-preview，见 lib/media/variant-url.ts），
 * 并用 onError 逐级回退，功能与旧图完全兼容。
 *
 * P4（2026-11）读取侧本地优先：
 *  · 传入 mediaId（或 localMediaId）时，原生端**先查本地文件**（离线/刚拍的照片就存在本地），
 *    命中就直接用本地地址（Capacitor convertFileSrc，见 lib/modules/offline/media.ts）；
 *  · 本地没有 / 文件被 LRU 清理（onError）→ 自动回退到远端变体链，功能不退化；
 *  · 查本地期间不渲染远端 <img>（source = 'pending'）→ 不会先发一个远端请求再换图闪一下；
 *    这段时间铺的是与原图同尺寸的占位块，版式不跳。
 *
 * 三条硬约束：
 *  1. 不拉原图：有变体就用变体（列表 thumbnail / 中等卡片 preview）；
 *  2. 不抖版式：fill 需要定尺寸父容器；非 fill 用 width/height 属性固定宽高比；
 *  3. 不白屏：有 -blur.jpg 时把它作为 <img> 的 CSS 背景先铺上（16px 模糊图，天然马赛克），
 *     主图解码完成后自然覆盖，无需额外 DOM / 状态，也不产生第二个请求之外的代价。
 *
 * 回退：本地文件失败 → thumbnail 404（旧图没生成过变体）→ preview → 原图；全部失败才隐藏自身，
 * 避免破图标。生产环境「彻底解决」仍需服务端按需生成变体（已具备：app/api/uploads）。
 */
export interface RemoteImageProps {
  /** 原图 URL（也接受已是变体的 URL —— 幂等，不会二次加后缀）。本地/离线照片可为空 */
  src: string | null | undefined
  alt: string
  /** 媒体主键：给了它，原生端就优先用本地文件（离线未同步的照片只有它能显示） */
  mediaId?: number | string | null
  /** 与 mediaId 等价的别名（部分老调用点用的是这个名字） */
  localMediaId?: number | string | null
  /** 目标变体：列表用 thumbnail（480px）/ 中等卡片用 preview（1600px）/ 原图用 original */
  variant?: MediaVariant | 'original'
  /** 固有宽高（px），用于 <img> 的 width/height 属性防 CLS；fill 模式下仅作兜底 */
  width?: number
  height?: number
  /** 填充父容器（父容器需 position:relative 且有确定尺寸） */
  fill?: boolean
  /** LCP 图（首屏主图）：eager + fetchPriority=high；默认懒加载 */
  priority?: boolean
  /** 图片主体位置（相册竖版裁切用），默认 center */
  objectPosition?: string
  className?: string
  /** 全部候选都加载失败时回调（调用方渲染占位图形） */
  onFinalError?: () => void
}

export default function RemoteImage({
  src,
  alt,
  mediaId,
  localMediaId,
  variant = 'thumbnail',
  width = 96,
  height = 96,
  fill = false,
  priority = false,
  objectPosition,
  className,
  onFinalError,
}: RemoteImageProps) {
  // 回退链：变体 → preview → 原图（无变体可派生时就是 [原图]；original 则直取原图）
  const ordered = useMemo(() => {
    if (!src) return []
    if (variant === 'original') return [src]
    return variantChain(src, variant)
  }, [src, variant])

  const localId = mediaId ?? localMediaId ?? null
  /** 列表缩略图用本机 320px 副本（快）；预览/大图用原图（清晰）。 */
  const local = useLocalMediaSource(
    { mediaId: localId, remoteUrl: src ?? null },
    { prefer: variant === 'thumbnail' ? 'thumb' : 'original' },
  )

  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  /** 本地文件加载失败（被 LRU 清理 / 文件损坏）：本组件立刻回退远端，且本会话不再试本地 */
  const [localBroken, setLocalBroken] = useState(false)

  // 换图（列表复用节点、切城市/切筛选）时重置回退进度
  useEffect(() => {
    setIndex(0)
    setFailed(false)
    setLocalBroken(false)
  }, [ordered, local.url])

  /**
   * 本机只有 320px 缩略图、而这里要的是预览/大图时是否该用它 ——
   * 统一规则见 isLocalMediaUsable（在线走远端高清，离线才接受小图）。
   */
  const localSrc =
    !localBroken && isLocalMediaUsable(local, { wantsLarge: variant !== 'thumbnail', hasRemote: Boolean(src) })
      ? local.url
      : ''
  const waitingLocal = local.source === 'pending'
  const activeSrc = localSrc || ordered[Math.min(index, Math.max(0, ordered.length - 1))]

  // 模糊占位：只有可派生 blur 变体时才额外请求（旧图 404 的代价是一次极小的 404）
  const blurUrl = useMemo(
    () => (variant === 'original' || localSrc ? null : deriveVariantUrl(src, 'blur')),
    [src, variant, localSrc],
  )

  const handleError = () => {
    if (localSrc) {
      // 本地文件不可用（被 LRU 清理 / 拷贝损坏）：作废缓存并回退远端链
      setLocalBroken(true)
      local.invalidate()
      if (ordered.length === 0) {
        setFailed(true)
        onFinalError?.()
      }
      return
    }
    if (index < ordered.length - 1) {
      setIndex(index + 1)
      return
    }
    setFailed(true)
    onFinalError?.()
  }

  /**
   * 原生端正在查本地文件（通常几毫秒）：先给同尺寸占位，**不渲染远端 <img>**。
   * 否则弱网/离线时会先发一个注定失败的远端请求，命中本地后再换图 —— 那一下就是可见的闪白。
   */
  if (waitingLocal) {
    return (
      <span
        aria-hidden="true"
        data-media-pending="1"
        className={cn(fill ? 'absolute inset-0 block h-full w-full' : 'block', className)}
        style={
          fill
            ? { backgroundImage: blurUrl ? `url("${blurUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: objectPosition ?? 'center' }
            : {
                width,
                height,
                backgroundImage: blurUrl ? `url("${blurUrl}")` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: objectPosition ?? 'center',
              }
        }
      />
    )
  }

  if (!activeSrc) return null

  const usingLocal = Boolean(localSrc)

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 移动壳是静态导出（images.unoptimized），next/image 不会优化；这里直接吃服务端三级变体 + 本地文件
    <img
      src={activeSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? 'eager' : 'lazy'}
      // 弱网下优先把主线程让给交互：异步解码，避免解码长图卡住滚动
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      draggable={false}
      onError={handleError}
      // 供 e2e / 排查用：这张图最终走的是本地文件还是远端（不参与样式）
      data-media-source={usingLocal ? 'local' : 'remote'}
      className={cn(
        'object-cover',
        fill && 'absolute inset-0 h-full w-full',
        className,
      )}
      style={{
        // 模糊占位（无 / 不可派生时不设，浏览器不请求）
        backgroundImage: blurUrl ? `url("${blurUrl}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: objectPosition ?? 'center',
        objectPosition: objectPosition ?? undefined,
        // 候选全挂：隐藏自身而不是留破图标（fill 模式不影响父容器尺寸）
        visibility: failed ? 'hidden' : undefined,
      }}
    />
  )
}
