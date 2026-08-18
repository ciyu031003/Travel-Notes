'use client'

import { useState } from 'react'
import { ArrowLeft, MapPin } from 'lucide-react'
import AlbumPhoto from './AlbumPhoto'
import AlbumDayDivider from './AlbumDayDivider'
import PhotoViewer from './PhotoViewer'
import PixelBadge from './PixelBadge'
import TravelFilmCard from './TravelFilmCard'
import TravelLocationBadge from './TravelLocationBadge'
import TravelTimeline from './TravelTimeline'

export interface TravelArchiveDay {
  date: string
  title: string
  images: string[]
}

export interface TravelArchiveCity {
  name: string
  province: string
  images: string[]
  date: string
  days?: TravelArchiveDay[]
}

interface TravelArchiveViewProps {
  city: TravelArchiveCity
  onClose: () => void
}

/**
 * 旅行档案视图：封面 = TravelFilmCard hero，档案信息 + DAY 分隔 + 照片网格 + 全屏查看器。
 */
export default function TravelArchiveView({ city, onClose }: TravelArchiveViewProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const dayList = city.days && city.days.length > 0
    ? city.days
    : [{ date: city.date, title: city.name, images: city.images }]

  const viewerImages = dayList.flatMap((d, di) =>
    d.images.map((src, si) => ({
      src,
      alt: `${city.name} DAY ${di + 1} · ${si + 1}`,
    }))
  )

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-album-bg0">
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-black/40 px-4 backdrop-blur-md md:px-8">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-album-text1 transition-colors hover:bg-white/20"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回相册
        </button>
        <span className="font-zpix text-sm font-bold tracking-widest text-album-accent">
          {city.name} · 旅行档案
        </span>
      </div>

      <main className="mx-auto w-full max-w-3xl px-4 py-5">
        <TravelFilmCard
          variant="hero"
          coverUrl={city.images[0]}
          cityName={city.name}
          title={`${city.name} 旅行档案`}
          dateRange={city.date}
          photoCount={city.images.length}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TravelLocationBadge location={city.province ? `${city.province} · ${city.name}` : city.name} />
          <PixelBadge className="gap-1.5">
            <MapPin className="h-3 w-3" />
            {city.date}
          </PixelBadge>
          <PixelBadge>{city.images.length} 张</PixelBadge>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-album-surface p-4">
          <TravelTimeline
            items={[
              {
                label: city.date,
                title: city.name,
                subtitle: city.province ? `${city.province} · ${city.images.length} 张照片` : `${city.images.length} 张照片`,
              },
            ]}
          />
        </div>

        <div className="mt-5">
          <AlbumDayDivider day={1} label={city.name} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {city.images.map((src, i) => (
            <AlbumPhoto
              key={`${src}-${i}`}
              src={src}
              alt={`${city.name} ${i + 1}`}
              aspect="square"
              onClick={() => setViewerIndex(i)}
            />
          ))}
        </div>
      </main>

      {viewerIndex !== null && (
        <PhotoViewer
          images={viewerImages}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      )}
    </div>
  )
}




