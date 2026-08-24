import { Sparkles } from 'lucide-react'
import ProgressRow from './ProgressRow'
import { TravelInfoColors } from './types'

export default function StatsSection({
  provincesLit,
  totalProvinces,
  citiesWithMemories,
  totalCities,
}: {
  provincesLit: number
  totalProvinces: number
  citiesWithMemories: number
  totalCities: number
}) {
  const provincePct =
    totalProvinces > 0 ? Math.min(100, (provincesLit / totalProvinces) * 100) : 0
  const cityPct =
    totalCities > 0 ? Math.min(100, (citiesWithMemories / totalCities) * 100) : 0

  return (
    <section
      className="relative rounded-2xl p-4 border"
      style={{
        borderColor: `${TravelInfoColors.sakura}66`,
        background:
          'linear-gradient(135deg, rgba(250,251,247,0.95) 0%, rgba(245,220,224,0.35) 100%)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full"
          style={{ background: `${TravelInfoColors.bloom}33` }}
        >
          <Sparkles className="w-4 h-4" style={{ color: TravelInfoColors.bloom }} />
        </span>
        <h3
          className="text-sm font-semibold tracking-wide"
          style={{ color: TravelInfoColors.ink }}
        >
          旅行进度
        </h3>
      </div>

      <div className="space-y-3.5">
        <ProgressRow
          label="已点亮省份"
          value={provincesLit}
          total={totalProvinces}
          percent={provincePct}
          fromColor={TravelInfoColors.bloom}
          toColor={TravelInfoColors.sakura}
        />
        <ProgressRow
          label="已留下回忆城市"
          value={citiesWithMemories}
          total={totalCities}
          percent={cityPct}
          fromColor={TravelInfoColors.sky}
          toColor={TravelInfoColors.mist}
        />
      </div>
    </section>
  )
}
