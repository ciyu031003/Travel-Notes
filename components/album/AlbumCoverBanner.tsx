'use client'

import { BookOpen } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'

/**
 * 像素模式顶部「相册封面横幅」（P2-32 拆分自 album 页）。
 * 纯展示：只关心城市数/照片总数，不参与取数与交互。
 */
export default function AlbumCoverBanner({
  cityCount,
  photoCount,
}: {
  cityCount: number
  photoCount: number
}) {
  return (
    <div className="max-w-6xl mx-auto px-4 mb-5">
      <div className="book-cover-3d relative rounded-sm p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="pixel-corner-gold-tl" />
        <div className="pixel-corner-gold-tr" />
        <div className="pixel-corner-gold-bl" />
        <div className="pixel-corner-gold-br" />

        <div className="flex items-center gap-4">
          <div className="item-frame w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center hidden sm:flex">
            <Icon icon={BookOpen} size="lg" className="text-album-accent" />
          </div>
          <div>
            <h1 className="font-zpix text-xl sm:text-2xl font-bold text-album-accent tracking-wider drop-shadow-[0_3px_0_rgba(0,0,0,0.7)]">
              旅行相册
            </h1>
            <p className="text-xs text-album-warm mt-1 tracking-widest">
              TRAVEL ALBUM · SAVE OUR MEMORIES
            </p>
          </div>
        </div>

        <div className="text-right hidden sm:block select-none">
          <p className="text-xs text-album-accent font-bold">{cityCount} 座城市 · {photoCount} 张照片</p>
          <p className="text-xs text-album-warm mt-1">点击照片，留下你的留言</p>
        </div>
      </div>
    </div>
  )
}
