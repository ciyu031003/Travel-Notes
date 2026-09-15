import type { WeatherKind } from './types'
import { Icon } from '@/components/mobile/Icon'
import { WEATHER_ICON, WEATHER_TONE, type WeatherKind as IconWeatherKind } from '@/lib/mobile/icon-system'
import type { IconSize } from '@/lib/mobile/icon-system'

/**
 * 天气图标 —— 统一走图标体系。
 *
 * 修订：原先四处硬编码 hex（#E4B478 / #A8C8DC / #5A6670）+ 内联 opacity，
 * 其中两个是冷色（sky），与全站暖色取向不一致，且暗色模式无法适配。
 * 现改为暖/中性 token 上色，尺寸统一 20px。
 */
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
  return <Icon icon={WEATHER_ICON[k]} size={size} tone={WEATHER_TONE[k]} className={className} />
}
