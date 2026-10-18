'use client'

import dynamicImport from 'next/dynamic'
import { BookOpen, MapPin, Sparkles } from '@/lib/mobile/icon-system'
import ErrorBoundary from '@/components/ErrorBoundary'
import { Icon } from '@/components/mobile/Icon'
import TravelLocationBadge from './TravelLocationBadge'
import TravelTimeline from './TravelTimeline'
import { formatDotDate } from '@/lib/modules/album/presentation'
import type { AlbumCity } from '@/hooks/use-album-data'

// Canvas 重组件继续按需加载（与拆分前一致：ssr:false，渲染时才拉）
const DriftWall = dynamicImport(() => import('@/components/album/driftwall/DriftWall'), { ssr: false })

const formatDate = formatDotDate

/**
 * 右侧「拍立得照片墙」：城市档案头 + 地点/日期时间线 + DriftWall 照片墙（P2-32 拆分自 album 页）。
 * 未选城市时显示空态。DriftWall 仍被 ErrorBoundary 包住，WebGL 失败只降级这一块。
 */
export default function AlbumPhotoWall({
  city,
  onOpenArchive,
  onOpenViewer,
}: {
  city: AlbumCity | null
  onOpenArchive: () => void
  onOpenViewer: (index: number) => void
}) {
  if (!city) {
    return (
      <div className="flex flex-col items-center justify-center h-[420px] text-album-warm gap-3">
        <div className="item-frame w-20 h-20 flex items-center justify-center">
          <Icon icon={MapPin} size="lg" className="text-album-accent opacity-60" />
        </div>
        <p className="text-sm font-bold tracking-wider">从书架选择一本相册</p>
        <p className="text-xs text-album-warm">点亮属于你们的旅行记忆</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3 select-none">
        <div className="flex items-center gap-2">
          <h2 className="font-zpix text-lg font-bold text-album-accent tracking-wide drop-shadow-[2px_2px_0_rgba(0,0,0,0.7)]">
            {city.name} · 拍立得记忆
          </h2>
          <span className="text-xs text-album-warm font-bold bg-black/40 border border-pixel-line px-2 py-0.5">
            {city.images.length} 张
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenArchive}
          className="pixel-btn pixel-border-gold px-2.5 py-1 text-xs font-bold rounded-sm flex items-center gap-1.5"
        >
          <Icon icon={BookOpen} size="sm" />
          档案
        </button>
        <p className="text-xs text-album-warm flex items-center gap-1.5">
          <Icon icon={Sparkles} size="sm" className="text-album-accent" />
          {formatDate(city.date)} · 点击照片开启留言
        </p>
      </div>

      {/* 旅行档案：地点/日期/DAY 节点（Stage 1.4） */}
      <div className="rounded-lg border border-pixel-line bg-pixel-panel2 p-3 mb-3">
        <div className="flex flex-wrap gap-2 mb-2">
          <TravelLocationBadge location={city.province ? `${city.province} · ${city.name}` : city.name} />
          <span className="font-zpix text-xs text-album-accent">{formatDate(city.date)}</span>
          <span className="font-zpix text-xs text-album-text2">{city.images.length} 张</span>
        </div>
        <TravelTimeline
          items={[
            {
              label: formatDate(city.date),
              title: city.name,
              subtitle: `${city.images.length} 张照片 · 点击照片开启留言`,
            },
          ]}
        />
      </div>

      {/* 移动端也用显式高度（min-h 不触发 .drift-wall 的 height:100%，曾致整面照片墙零高不可见） */}
      <div className="h-[440px] lg:h-[calc(100vh-230px)]">
        <ErrorBoundary label="DriftWall">
          <DriftWall
            items={city.images.map((src, i) => ({
              image: src,
              title: `${city.name} · ${i + 1}`,
              onClick: () => onOpenViewer(i),
            }))}
            columns={4}
            tileWidth={200}
            tileHeight={140}
            gap={18}
            radius={14}
            tilt={16}
            turn={-14}
            depth={120}
            speed={42}
            variance={0.45}
            parallax={0.6}
            pauseOnHover
            lift={64}
            fade={0.6}
            dim={0.55}
          />
        </ErrorBoundary>
      </div>
    </>
  )
}
