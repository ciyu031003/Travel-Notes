'use client'

import { useRouter } from 'next/navigation'
import { Lock } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import PixelDeskBackground from '@/components/album/PixelDeskBackground'
import PixelUnlockModal from '@/components/album/PixelUnlockModal'
import SpaceUnlockModal from '@/components/album/space/SpaceUnlockModal'
import AlbumModeSwitch from './AlbumModeSwitch'

/**
 * 未解锁态：银河「秘密相册」页与像素「存档」页两种皮肤（P2-32 拆分自 album 页）。
 *
 * 两套解锁弹窗的成功回调都交给页面处理（清 showUnlockModal + 重新取数），
 * 页面持有 showUnlockModal 状态，保证与原实现一致。
 */
export default function AlbumUnlockScreen({
  viewMode,
  showUnlockModal,
  onOpenUnlock,
  onCloseUnlock,
  onUnlockSuccess,
  onSelectPixel,
}: {
  viewMode: 'space' | 'pixel'
  showUnlockModal: boolean
  onOpenUnlock: () => void
  onCloseUnlock: () => void
  onUnlockSuccess: () => void
  onSelectPixel: () => void
}) {
  const router = useRouter()

  if (viewMode === 'space') {
    return (
      <div className="min-h-dvh relative overflow-hidden flex items-center justify-center p-4 pb-[max(16px,env(safe-area-inset-bottom))] bg-album-bg0">
        {/* 星空氛围底（纯 CSS 星点，避免未解锁时启动 WebGL） */}
        <div className="absolute inset-0 opacity-70" aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 53) % 100}%`,
                width: i % 5 === 0 ? 2.5 : 1.5,
                height: i % 5 === 0 ? 2.5 : 1.5,
                opacity: 0.25 + (i % 4) * 0.18,
                animation: `space-twinkle ${2 + (i % 5)}s ease-in-out infinite`,
                animationDelay: `${(i % 7) * 0.4}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 w-full max-w-md space-glass rounded-3xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-album-bg0/70 border border-white/15 flex items-center justify-center shadow-[0_0_40px_var(--ui-album-accent-dim)]">
            <Icon icon={Lock} size="lg" className="text-album-accent" />
          </div>
          <h2 className="text-album-text1 text-2xl font-bold tracking-[0.3em]">旅行相册 · 银河存档</h2>
          <p className="text-album-text2 text-xs mt-3 leading-relaxed">
            这是旅行中的秘密相册
            <br />
            输入纪念日，唤醒旅行中的回忆
          </p>
          <button
            type="button"
            onClick={onOpenUnlock}
            className="mt-6 w-full space-glass-btn rounded-full !py-3 text-sm font-bold text-album-text1"
          >
            解锁相册
          </button>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="space-glass-btn rounded-full px-4 py-2 text-xs text-album-text2"
            >
              返回首页
            </button>
            <AlbumModeSwitch viewMode="space" variant="to-pixel" onSelect={onSelectPixel} />
          </div>
        </div>

        <SpaceUnlockModal isOpen={showUnlockModal} onClose={onCloseUnlock} onSuccess={onUnlockSuccess} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh relative overflow-hidden flex items-center justify-center p-4 pb-[max(16px,env(safe-area-inset-bottom))] bg-album-bg1">
      <PixelDeskBackground />
      <div className="relative z-10 w-full max-w-md pixel-book-container rounded-sm p-8 text-center">
        <div className="pixel-corner-gold-tl" />
        <div className="pixel-corner-gold-tr" />
        <div className="pixel-corner-gold-bl" />
        <div className="pixel-corner-gold-br" />

        <div className="book-cover-3d w-28 h-36 mx-auto mb-6 flex flex-col items-center justify-center gap-2 rounded-sm">
          <Icon icon={Lock} size="lg" className="text-album-accent" />
          <span className="text-xs text-album-warm font-bold">相册已上锁</span>
        </div>
        <h2 className="font-zpix text-2xl font-bold text-album-accent tracking-wider drop-shadow-[0_4px_0_rgba(0,0,0,0.7)]">
          旅行相册 · 存档
        </h2>
        <p className="text-xs text-album-warm mt-3 leading-relaxed">
          这是旅行中的秘密相册
          <br />
          输入纪念日即可解锁
        </p>
        <button
          type="button"
          onClick={onOpenUnlock}
          className="mt-6 w-full mc-button mc-button-gold !py-2.5 text-xs font-bold"
        >
          解锁相册
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-3 w-full mc-button mc-button-parchment !py-2 text-xs font-bold"
        >
          返回首页
        </button>
      </div>

      <PixelUnlockModal isOpen={showUnlockModal} onClose={onCloseUnlock} onSuccess={onUnlockSuccess} />
    </div>
  )
}
