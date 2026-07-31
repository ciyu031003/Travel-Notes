import { Cloud, CloudRain, Cloudy, Sun } from 'lucide-react'
import type { WeatherKind } from './types'

export default function WeatherIcon({
  kind,
  className,
}: {
  kind: WeatherKind
  className?: string
}) {
  switch (kind) {
    case 'sunny':
      return <Sun className={className} style={{ color: '#E8B8C2' }} />
    case 'cloudy':
      return <Cloudy className={className} style={{ color: '#A8C8DC' }} />
    case 'rainy':
      return <CloudRain className={className} style={{ color: '#A8C8DC' }} />
    case 'overcast':
    default:
      return <Cloud className={className} style={{ color: '#5A6670', opacity: 0.55 }} />
  }
}
