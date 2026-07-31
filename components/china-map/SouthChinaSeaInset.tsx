import { ChinaMapColors as colors } from './types'

export default function SouthChinaSeaInset() {
  return (
    <div className="absolute bottom-4 left-4 w-[116px] h-[162px] rounded-lg border-2 border-[#D8DDD8]/60 bg-[#FAFBF7]/60 backdrop-blur-sm p-1.5 pointer-events-none">
      <svg
        viewBox="0 0 116 162"
        className="w-full h-full"
        role="img"
        aria-label="南海诸岛"
      >
        <text
          x="58"
          y="14"
          textAnchor="middle"
          fontSize="8"
          fill={colors.ink}
          opacity="0.5"
        >
          南海诸岛
        </text>
        <g
          stroke={colors.ink}
          strokeWidth="0.6"
          strokeOpacity="0.25"
          fill="none"
          strokeDasharray="3 2"
        >
          <path d="M 20 30 Q 40 50 30 70 Q 50 90 35 110 Q 55 130 40 150" />
          <path d="M 45 28 Q 65 48 55 68 Q 75 88 60 108 Q 80 128 65 148" />
          <path d="M 70 30 Q 90 50 80 70 Q 100 90 85 110" />
        </g>
        <g fill={colors.bloom} opacity="0.6">
          <circle cx="30" cy="45" r="1.5" />
          <circle cx="50" cy="60" r="1.5" />
          <circle cx="40" cy="80" r="1.5" />
          <circle cx="60" cy="95" r="1.5" />
          <circle cx="35" cy="115" r="1.5" />
          <circle cx="55" cy="130" r="1.5" />
          <circle cx="70" cy="50" r="1.5" />
          <circle cx="80" cy="75" r="1.5" />
        </g>
      </svg>
    </div>
  )
}
