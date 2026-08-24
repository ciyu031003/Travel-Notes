import { Calendar, Heart, Sparkles } from 'lucide-react'
import { formatAnniversaryDate, TravelInfoColors } from './types'

export default function AnniversarySection({
  anniversaryStart,
  daysTogether,
}: {
  anniversaryStart?: string
  daysTogether: number
}) {
  const hasAnniversary = !!anniversaryStart

  return (
    <section
      className="relative rounded-2xl p-4 border transition-all duration-300 hover:-translate-y-0.5"
      style={{
        borderColor: `${TravelInfoColors.sakura}66`,
        background:
          'linear-gradient(135deg, rgba(245,220,224,0.45) 0%, rgba(250,251,247,0.9) 100%)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full"
            style={{ background: TravelInfoColors.bloom, opacity: 0.2 }}
          >
            <Calendar className="w-4 h-4" style={{ color: TravelInfoColors.bloom }} />
          </span>
          <h3
            className="text-sm font-semibold tracking-wide"
            style={{ color: TravelInfoColors.ink }}
          >
            纪念日
          </h3>
        </div>
        <Heart
          className="w-4 h-4 animate-pulse"
          style={{ color: TravelInfoColors.bloom, fill: TravelInfoColors.bloom }}
        />
      </div>
      {hasAnniversary ? (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className="text-5xl font-bold tabular-nums"
              style={{ color: TravelInfoColors.ink }}
            >
              {daysTogether}
            </span>
            <span
              className="text-base font-medium"
              style={{ color: TravelInfoColors.ink, opacity: 0.7 }}
            >
              天
            </span>
          </div>
          <div
            className="mt-2 text-xs flex items-center gap-1.5"
            style={{ color: TravelInfoColors.ink, opacity: 0.6 }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: TravelInfoColors.bloom }} />
            从 {formatAnniversaryDate(anniversaryStart!)} 开始
          </div>
        </>
      ) : (
        <div
          className="py-3 text-center"
          style={{ color: TravelInfoColors.ink, opacity: 0.5 }}
        >
          <p className="text-sm">还没有设置纪念日</p>
          <p className="text-xs mt-1">请联系管理员在后台设置</p>
        </div>
      )}
    </section>
  )
}
