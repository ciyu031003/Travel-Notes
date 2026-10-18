'use client'

import dynamicImport from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'
import type { StarCity } from '@/hooks/use-album-data'

const TravelStarMap = dynamicImport(() => import('@/components/album/TravelStarMap'), { ssr: false })

/**
 * 旅行星图全屏浮层（P2-32 拆分自 album 页）：关闭按钮 + dynamic 星图 + ErrorBoundary。
 * 城市点数据与统计由页面传入，保持与拆分前相同的 props。
 */
export default function AlbumStarMapOverlay({
  cities,
  stats,
  onSelectCity,
  onClose,
}: {
  cities: StarCity[]
  stats: { cities: number; days: number; photos: number }
  onSelectCity: (city: { name: string }) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-album-bg0">
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-black/40 px-4 backdrop-blur-md">
        <span className="font-zpix text-sm font-bold tracking-widest text-album-accent">旅行星图</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-album-text1"
        >
          关闭
        </button>
      </div>
      <main className="mx-auto w-full max-w-3xl px-4 py-5">
        <ErrorBoundary label="TravelStarMap">
          <TravelStarMap cities={cities} stats={stats} onSelectCity={onSelectCity} />
        </ErrorBoundary>
      </main>
    </div>
  )
}
