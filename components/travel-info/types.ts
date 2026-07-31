export const TravelInfoColors = {
  cream: '#FAFBF7',
  ink: '#5A6670',
  sakura: '#F5DCE0',
  bloom: '#E8B8C2',
  sky: '#A8C8DC',
  mist: '#D6E8F0',
}

export const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export type WeatherKind = 'sunny' | 'cloudy' | 'rainy' | 'overcast'

export interface WeatherInfo {
  kind: WeatherKind
  label: string
  temp: number
}

export function seedWeatherFor(city: string, seed: number): WeatherInfo {
  const kinds: WeatherKind[] = ['sunny', 'cloudy', 'rainy', 'overcast']
  const labels: Record<WeatherKind, string> = {
    sunny: '晴',
    cloudy: '多云',
    rainy: '小雨',
    overcast: '阴',
  }
  const k = kinds[seed % kinds.length]
  const baseTemp =
    city.includes('哈尔滨') || city.includes('长春')
      ? 18
      : city.includes('北京')
      ? 26
      : city.includes('上海')
      ? 29
      : city.includes('广州') || city.includes('深圳')
      ? 32
      : 25
  const temp = baseTemp + ((seed * 7) % 7) - 2
  return { kind: k, label: labels[k], temp }
}

export function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

export function formatAnniversaryDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`
}

export function daysBetween(fromIso: string, now: Date) {
  const from = new Date(fromIso)
  if (isNaN(from.getTime())) return 0
  const ms = now.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}
