'use client'

import { BookOpen, MapPin } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { formatDotDate } from '@/lib/modules/album/presentation'
import type { AlbumCity } from '@/hooks/use-album-data'

/** 书脊配色（循环使用，与拆分前一致） */
const SPINE_COLORS = [
  'book-spine-red',
  'book-spine-blue',
  'book-spine-green',
  'book-spine-purple',
  'book-spine-brown',
  'book-spine-leather',
]

const formatDate = formatDotDate

/**
 * 左侧「旅行书架」：城市相册书脊列表 + 选中态 + 空/加载态（P2-32 拆分自 album 页）。
 * 纯展示组件：选中城市由页面持有，点击只回调 onSelectCity。
 */
export default function AlbumBookshelf({
  cities,
  selectedCity,
  loading,
  onSelectCity,
}: {
  cities: AlbumCity[]
  selectedCity: AlbumCity | null
  loading: boolean
  onSelectCity: (city: AlbumCity) => void
}) {
  return (
    <aside className="lg:sticky lg:top-[72px] self-start w-full">
      <div className="pixel-book-container rounded-sm overflow-hidden">
        <div className="p-4 border-b-4 border-black/70 bg-pixel-panel3">
          <div className="flex items-center justify-between">
            <h2 className="font-zpix text-sm font-bold text-album-accent tracking-wider flex items-center gap-2">
              <Icon icon={BookOpen} size="sm" />
              旅行书架
            </h2>
            <span className="text-xs text-album-warm font-bold">{cities.length} 册</span>
          </div>
        </div>

        <div className="p-4 bg-pixel-panel2">
          {loading ? (
            <div className="text-album-warm text-xs py-6 text-center tracking-wider">装载中...</div>
          ) : cities.length === 0 ? (
            <div className="text-album-warm text-xs py-6 text-center tracking-wider">
              <Icon icon={MapPin} size="lg" className="mx-auto mb-2 opacity-40" />
              还没有旅行记录
            </div>
          ) : (
            <>
              <div className="flex gap-3 justify-start overflow-x-auto pb-2 lg:flex-wrap lg:justify-start lg:overflow-visible snap-x">
                {cities.map((city, index) => {
                  const selected = selectedCity?.name === city.name
                  const spineColor = SPINE_COLORS[index % SPINE_COLORS.length]
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => onSelectCity(city)}
                      title={`${city.name} · ${city.images.length} 张照片 · ${formatDate(city.date)}`}
                      className={`relative w-14 h-36 shrink-0 snap-start flex flex-col items-center justify-between py-2 text-white transition-all duration-200 hover:-translate-y-1.5 group shadow-[3px_6px_8px_rgba(0,0,0,0.6)] ${spineColor} ${
                        selected ? '-translate-y-1.5' : ''
                      }`}
                    >
                      {selected && (
                        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-1.5 h-4 bg-album-accent border border-black rounded-b-sm z-20 shadow-[1px_1px_2px_rgba(0,0,0,0.4)]" />
                      )}
                      <span className="w-full h-1 bg-album-accent/20 opacity-50" />
                      <span className="text-[10px] text-album-accent font-bold">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="[writing-mode:vertical-rl] text-xs font-bold tracking-wide text-album-text1 max-h-16 truncate">
                        {city.name}
                      </span>
                      <span className="text-[10px] text-album-text2">{city.images.length}张</span>
                      <span className="w-full h-1 bg-album-accent/20 opacity-50" />
                    </button>
                  )
                })}
              </div>
              <div className="wood-shelf w-full h-4 mt-4" />
            </>
          )}
        </div>

        <div className="p-3 border-t border-pixel-ink bg-pixel-panel text-xs text-album-warm text-center leading-relaxed">
          每一本相册收录一座城市的回忆，
          <br />
          点击照片即可在书中留言
        </div>
      </div>
    </aside>
  )
}
