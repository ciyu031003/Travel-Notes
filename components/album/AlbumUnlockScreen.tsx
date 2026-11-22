'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/mobile/Button'
import { Icon } from '@/components/mobile/Icon'
import { ChevronLeft, Lock } from '@/lib/mobile/icon-system'
import { useAlbumUnlock } from '@/hooks/use-album-unlock'
import AlbumLockDialog from './AlbumLockDialog'

/**
 * 相册未解锁态（1.30.1 重做）：唯一的现代锁屏页。
 *
 * 背景：像素/银河两套皮肤各有一个锁屏 —— 像素皮是羊皮纸 + zpix 像素字 + MC 风格按钮，
 * 与 V6 的暖粉奶油语言完全冲突（真机反馈「像另一个 App」）。这里整体砍掉双皮肤分支，
 * 改为一套 V6 语言的锁屏：暖粉奶油底、衬线大标题、20px 圆角白卡、圆形玻璃返回键、
 * 玫瑰强调色 CTA；解锁弹窗走 components/album/AlbumLockDialog（全 App 共用一份）。
 *
 * 保留的行为契约：
 *  · 解锁状态机仍由 hooks/use-album-unlock 提供（口令 = 纪念日字符串）；
 *  · 页面级逃生口「没有纪念日？直接进入相册」走同一 skip 通道（服务端无口令时放行）；
 *  · 「想修改纪念日？」直接落到 /me/album-lock，用户被挡住时不用再去猜设置在哪；
 *  · 页面仍由 app/album/page.tsx 掌管 showUnlockModal，组件只负责渲染与回调。
 *
 * 兼容：viewMode / onSelectPixel 自 1.30.1 起不再影响视觉（锁屏只有一套），
 * 但页面仍会传：保留为可选 props，避免与页面侧的并行改动互相拉扯。
 */
export default function AlbumUnlockScreen({
  showUnlockModal,
  onOpenUnlock,
  onCloseUnlock,
  onUnlockSuccess,
}: {
  /** @deprecated 锁屏不再区分像素/银河皮肤，仅用于兼容页面传参 */
  viewMode?: 'space' | 'pixel'
  /** @deprecated 同上 */
  onSelectPixel?: () => void
  showUnlockModal: boolean
  onOpenUnlock: () => void
  onCloseUnlock: () => void
  onUnlockSuccess: () => void
}) {
  const router = useRouter()
  const { error, verifying, skip } = useAlbumUnlock({
    onClose: onCloseUnlock,
    onSuccess: onUnlockSuccess,
  })

  return (
    <div className="lock-page flex min-h-dvh flex-col">
      <header className="m-safe-top-16 flex items-center px-[18px]">
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="返回首页"
          className="lock-glass-btn"
        >
          <Icon icon={ChevronLeft} size="md" />
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
        <div className="lock-rise lock-halo">
          <span className="lock-emblem">
            <Icon icon={Lock} size="lg" />
          </span>
        </div>

        <p className="lock-rise lock-rise--2 m2-eyebrow mt-5">Private Album</p>
        <h1 className="lock-rise lock-rise--2 lock-serif mt-2 text-[32px] leading-[38px] text-[var(--m-text)]">
          旅行相册
        </h1>
        <p className="lock-rise lock-rise--3 mt-2 max-w-[300px] text-[15px] leading-[22px] text-[var(--m-muted)]">
          只属于你们的纪念相册。输入纪念日，翻开这一路的光影与留言。
        </p>

        <section className="lock-rise lock-rise--4 lock-card mt-7 w-full max-w-[340px] p-5 text-left">
          <p className="text-[13px] leading-[19px] text-[var(--m-muted)]">
            纪念相册有「像素 / 银河」两种视图，共用同一个口令 —— 也就是你们的纪念日。
          </p>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-3 rounded-[12px] bg-[var(--m-tone-clay-bg)] px-3 py-2 text-[13px] leading-[18px] font-medium text-[var(--m-danger)]"
            >
              {error}
            </p>
          )}

          <Button block size="lg" icon={Lock} className="mt-4" onClick={onOpenUnlock}>
            解锁相册
          </Button>
          <button
            type="button"
            onClick={skip}
            disabled={verifying}
            className="m-pressable mt-1 flex min-h-11 w-full items-center justify-center text-[13px] font-semibold text-[var(--m-accent-strong)] disabled:opacity-50"
          >
            没有纪念日？直接进入相册
          </button>
        </section>

        <Link
          href="/me/album-lock"
          className="m-pressable lock-rise lock-rise--4 mt-4 flex min-h-11 items-center gap-1 px-3 text-[13px] font-medium text-[var(--m-muted)] underline decoration-[var(--m-line-strong)] underline-offset-4"
        >
          想修改纪念日？
        </Link>
      </main>

      <AlbumLockDialog
        isOpen={showUnlockModal}
        onClose={onCloseUnlock}
        onSuccess={onUnlockSuccess}
      />
    </div>
  )
}
