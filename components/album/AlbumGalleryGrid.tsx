'use client'

import { useMemo, useState } from 'react'
import { BookOpen } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import TravelFilmCard from './TravelFilmCard'
import AddPhotoButton from './AddPhotoButton'
import { useLocalMediaUrls } from '@/hooks/use-local-media-url'
import { TRAVEL_TYPE_LABELS, formatDotDate } from '@/lib/modules/album/presentation'
import type { AlbumItem } from '@/hooks/use-album-data'
import {
  collectAlbumCompanions,
  collectAlbumTypes,
  filterAlbums,
} from './album-gallery-filters'

const formatDate = formatDotDate

/**
 * 「纪念相册」区块：类型 Tab + 同行者筛选 + 拍立得卡片网格/空态（P2-32 拆分自 album 页）。
 *
 * 筛选状态从页面下沉到这里：该区块在 albums.length > 0 时始终挂载，
 * 与拆分前一样不会因切城市/开关浮层而被卸载，筛选选择不会丢。
 * 新增相册/照片后通过 onRefresh 回调页面的取数刷新（行为不变）。
 */
export default function AlbumGalleryGrid({
  albums,
  onRefresh,
}: {
  albums: AlbumItem[]
  onRefresh: () => void
}) {
  const [albumTypeFilter, setAlbumTypeFilter] = useState<string>('ALL')
  const [albumCompanionFilter, setAlbumCompanionFilter] = useState<string | null>(null)

  const albumTypes = useMemo(() => collectAlbumTypes(albums), [albums])
  const albumCompanions = useMemo(() => collectAlbumCompanions(albums), [albums])
  const filteredAlbums = useMemo(
    () => filterAlbums(albums, albumTypeFilter, albumCompanionFilter),
    [albums, albumTypeFilter, albumCompanionFilter],
  )

  // 相册封面本地化（离线读：本地缓存命中 → 本地 URI）
  const albumCoverUrls = useMemo(
    () => albums.map((album) => album.coverUrl).filter((url): url is string => !!url),
    [albums],
  )
  const localMediaMap = useLocalMediaUrls(albumCoverUrls)

  return (
    <section className="max-w-6xl mx-auto px-4 mt-8">
      <div className="flex items-center gap-2 mb-3">
        <Icon icon={BookOpen} size="sm" className="text-album-accent" />
        <h2 className="font-zpix text-lg font-bold text-album-accent tracking-wide drop-shadow-[2px_2px_0_rgba(0,0,0,0.7)]">
          纪念相册
        </h2>
        <span className="text-xs text-album-warm font-bold bg-black/40 border border-pixel-line px-2 py-0.5">
          {filteredAlbums.length}/{albums.length} 册
        </span>
      </div>

      {/* 多元场景：按旅行类型分组 Tab + 按同行者筛选 */}
      {(albumTypes.length > 0 || albumCompanions.length > 0) && (
        <div className="mb-4 space-y-2">
          {albumTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setAlbumTypeFilter('ALL'); setAlbumCompanionFilter(null) }}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                  albumTypeFilter === 'ALL' && !albumCompanionFilter
                    ? 'bg-album-accent text-black border-album-accent'
                    : 'bg-black/40 text-album-warm border-pixel-line hover:bg-black/60'
                }`}
              >
                全部
              </button>
              {albumTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setAlbumTypeFilter(albumTypeFilter === type ? 'ALL' : type); setAlbumCompanionFilter(null) }}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                    albumTypeFilter === type
                      ? 'bg-album-accent text-black border-album-accent'
                      : 'bg-black/40 text-album-warm border-pixel-line hover:bg-black/60'
                  }`}
                >
                  {TRAVEL_TYPE_LABELS[type] || type}
                </button>
              ))}
            </div>
          )}
          {albumCompanions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold tracking-wider text-album-warm/70">同行者</span>
              {albumCompanions.map((companion) => (
                <button
                  key={companion.name}
                  type="button"
                  onClick={() => setAlbumCompanionFilter(albumCompanionFilter === companion.name ? null : companion.name)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                    albumCompanionFilter === companion.name
                      ? 'bg-album-accent text-black border-album-accent'
                      : 'bg-black/40 text-album-warm border-pixel-line hover:bg-black/60'
                  }`}
                >
                  {companion.name}
                  {companion.relation ? ` · ${companion.relation}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filteredAlbums.length === 0 ? (
        <p className="rounded-xl border border-dashed border-pixel-line bg-black/30 px-4 py-8 text-center text-sm text-album-warm">
          没有符合条件的相册
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredAlbums.map((album) => (
            <div key={album.id} className="relative">
              <TravelFilmCard
                coverUrl={album.coverUrl ? (localMediaMap[album.coverUrl] ?? album.coverUrl) : undefined}
                title={album.title}
                dateRange={album.date ? formatDate(album.date) : undefined}
                photoCount={album.mediaCount}
                badge={album.travelType ? TRAVEL_TYPE_LABELS[album.travelType] || album.travelType : undefined}
              />
              <AddPhotoButton albumId={album.id} onAdded={onRefresh} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
