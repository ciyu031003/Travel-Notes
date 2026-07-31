import { TravelInfoColors } from './types'

export default function ProgressRow({
  label,
  value,
  total,
  percent,
  fromColor,
  toColor,
}: {
  label: string
  value: number
  total: number
  percent: number
  fromColor: string
  toColor: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-xs font-medium"
          style={{ color: TravelInfoColors.ink, opacity: 0.85 }}
        >
          {label}
        </span>
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: TravelInfoColors.ink }}
        >
          {value}
          {total > 0 && (
            <span style={{ opacity: 0.5 }}> / {total}</span>
          )}
        </span>
      </div>
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ background: `${TravelInfoColors.ink}14` }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${percent}%`,
            background: `linear-gradient(90deg, ${fromColor}, ${toColor})`,
            boxShadow: `0 0 10px ${fromColor}66`,
          }}
        />
      </div>
    </div>
  )
}
