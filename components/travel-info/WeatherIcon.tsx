import type { WeatherKind } from './types'
import { TravelInfoColors } from './types'
import { Icon } from '@/components/mobile/Icon'
import { WEATHER_ICON, type WeatherKind as IconWeatherKind } from '@/lib/mobile/icon-system'
import type { IconSize } from '@/lib/mobile/icon-system'

/**
 * 天气图标 —— 走统一图标体系（尺寸/描边归一）。
 *
 * 颜色口径：复用本模块**已声明的调色板** `TravelInfoColors`，逐值与原实现一致
 * （sunny #E4B478 / cloudy·rainy #A8C8DC / overcast #5A6670@55%），属纯重构、零视觉变化。
 *
 * 为什么不用 Icon 的 tone：tone 指向 `--m-*` 体系，取值不同（例：`--m-warning` #B8801F
 * ≠ #E4B478、`--m-muted` #7D6754 ≠ #A8C8DC）。若套 tone，云雨图标会从蓝色变成棕褐色 ——
 * 这正是规范 §5.3「跨主题边界」要避免的静默变色。
 * 本模块（travel-info）其余文件同样统一使用 TravelInfoColors，保持口径一致。
 */
const WEATHER_COLOR: Record<WeatherKind, string> = {
  sunny: TravelInfoColors.bloom,
  cloudy: TravelInfoColors.sky,
  rainy: TravelInfoColors.sky,
  overcast: TravelInfoColors.ink,
}

export default function WeatherIcon({
  kind,
  className,
  size = 'md',
}: {
  kind: WeatherKind
  className?: string
  size?: IconSize
}) {
  const k = (kind as IconWeatherKind) in WEATHER_ICON ? (kind as IconWeatherKind) : 'overcast'
  return (
    <Icon
      icon={WEATHER_ICON[k]}
      size={size}
      className={className}
      style={{
        color: WEATHER_COLOR[k as WeatherKind],
        // 原实现对 overcast 使用 0.55 透明度，保持一致
        opacity: k === 'overcast' ? 0.55 : undefined,
      }}
    />
  )
}
