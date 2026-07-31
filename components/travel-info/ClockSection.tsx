'use client'

import { Heart } from 'lucide-react'
import { WEEKDAY_CN, pad2, TravelInfoColors } from './types'

export default function ClockSection({ now }: { now: Date }) {
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const secondsStr = pad2(now.getSeconds())
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY_CN[now.getDay()]}`

  return (
    <section
      className="relative flex items-center justify-between rounded-2xl p-4 overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, rgba(245,220,224,0.75) 0%, rgba(214,232,240,0.65) 100%)',
      }}
    >
      <div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-4xl font-semibold tracking-tight tabular-nums"
            style={{ color: TravelInfoColors.ink }}
          >
            {timeStr}
          </span>
          <span
            className="text-lg tabular-nums"
            style={{ color: TravelInfoColors.ink, opacity: 0.5 }}
          >
            :{secondsStr}
          </span>
        </div>
        <div className="mt-1 text-sm" style={{ color: TravelInfoColors.ink, opacity: 0.75 }}>
          {dateStr}
        </div>
      </div>
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: `${TravelInfoColors.bloom}33` }}
      >
        <Heart
          className="w-6 h-6"
          style={{ color: TravelInfoColors.bloom, fill: TravelInfoColors.bloom }}
        />
      </div>
    </section>
  )
}
