'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Heart,
  Calendar,
  Cloud,
  Sun,
  CloudRain,
  Cloudy,
  MapPin,
  RefreshCw,
  Sparkles,
  Thermometer,
  Waves,
} from 'lucide-react'

interface TravelInfoPanelProps {
  anniversaryStart?: string
  cities?: string[]
  provincesLit?: number
  totalProvinces?: number
  citiesWithMemories?: number
  totalCities?: number
}

const colors = {
  cream: '#FAFBF7',
  ink: '#5A6670',
  sakura: '#F5DCE0',
  bloom: '#E8B8C2',
  sky: '#A8C8DC',
  mist: '#D6E8F0',
}

const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

type WeatherKind = 'sunny' | 'cloudy' | 'rainy' | 'overcast'

interface WeatherInfo {
  kind: WeatherKind
  label: string
  temp: number
}

function seedWeatherFor(city: string, seed: number): WeatherInfo {
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

function WeatherIcon({ kind, className }: { kind: WeatherKind; className?: string }) {
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

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function formatAnniversaryDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`
}

function daysBetween(fromIso: string, now: Date) {
  const from = new Date(fromIso)
  if (isNaN(from.getTime())) return 0
  const ms = now.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export default function TravelInfoPanel({
  anniversaryStart,
  cities = ['北京', '上海', '广州'],
  provincesLit = 0,
  totalProvinces = 34,
  citiesWithMemories = 0,
  totalCities = 0,
}: TravelInfoPanelProps) {
  const [now, setNow] = useState<Date>(() => new Date())
  const [weatherSeed, setWeatherSeed] = useState<number>(() =>
    Math.floor(Math.random() * 1000)
  )
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const secondsStr = pad2(now.getSeconds())
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY_CN[now.getDay()]}`

  const hasAnniversary = !!anniversaryStart
  const daysTogether = useMemo(
    () => (hasAnniversary ? daysBetween(anniversaryStart!, now) : 0),
    [anniversaryStart, now, hasAnniversary]
  )

  const weathers = useMemo(
    () => cities.map((c, i) => seedWeatherFor(c, weatherSeed + i * 131)),
    [cities, weatherSeed]
  )

  const updateWeather = () => {
    setWeatherSeed(Math.floor(Math.random() * 1000))
    setWeatherUpdatedAt(new Date())
  }

  const updateTimeStr = `${pad2(weatherUpdatedAt.getHours())}:${pad2(
    weatherUpdatedAt.getMinutes()
  )}`

  const provincePct = totalProvinces > 0 ? Math.min(100, (provincesLit / totalProvinces) * 100) : 0
  const cityPct = totalCities > 0 ? Math.min(100, (citiesWithMemories / totalCities) * 100) : 0

  return (
    <aside
      className="relative w-full h-full flex flex-col gap-3 p-4 rounded-3xl border border-[#D6E8F0]/70 bg-[#FAFBF7]/85 backdrop-blur-md shadow-[0_12px_40px_-12px_rgba(90,102,112,0.18)] overflow-y-auto"
      style={{ fontFamily: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-50"
        style={{ background: colors.sakura }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-8 w-40 h-40 rounded-full blur-3xl opacity-40"
        style={{ background: colors.mist }}
      />

      {/* 1. 时钟/日期 */}
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
              style={{ color: colors.ink }}
            >
              {timeStr}
            </span>
            <span
              className="text-lg tabular-nums"
              style={{ color: colors.ink, opacity: 0.5 }}
            >
              :{secondsStr}
            </span>
          </div>
          <div className="mt-1 text-sm" style={{ color: colors.ink, opacity: 0.75 }}>
            {dateStr}
          </div>
        </div>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: `${colors.bloom}33` }}
        >
          <Heart
            className="w-6 h-6"
            style={{ color: colors.bloom, fill: colors.bloom }}
          />
        </div>
      </section>

      {/* 2. 纪念日 */}
      <section
        className="relative rounded-2xl p-4 border transition-all duration-300 hover:-translate-y-0.5"
        style={{
          borderColor: `${colors.sakura}66`,
          background:
            'linear-gradient(135deg, rgba(245,220,224,0.45) 0%, rgba(250,251,247,0.9) 100%)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-full"
              style={{ background: colors.bloom, opacity: 0.2 }}
            >
              <Calendar className="w-4 h-4" style={{ color: colors.bloom }} />
            </span>
            <h3
              className="text-sm font-semibold tracking-wide"
              style={{ color: colors.ink }}
            >
              纪念日
            </h3>
          </div>
          <Heart
            className="w-4 h-4 animate-pulse"
            style={{ color: colors.bloom, fill: colors.bloom }}
          />
        </div>
        {hasAnniversary ? (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className="text-5xl font-bold tabular-nums"
                style={{ color: colors.ink }}
              >
                {daysTogether}
              </span>
              <span
                className="text-base font-medium"
                style={{ color: colors.ink, opacity: 0.7 }}
              >
                天
              </span>
            </div>
            <div
              className="mt-2 text-xs flex items-center gap-1.5"
              style={{ color: colors.ink, opacity: 0.6 }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: colors.bloom }} />
              从 {formatAnniversaryDate(anniversaryStart!)} 开始
            </div>
          </>
        ) : (
          <div
            className="py-3 text-center"
            style={{ color: colors.ink, opacity: 0.5 }}
          >
            <p className="text-sm">还没有设置恋爱纪念日</p>
            <p className="text-xs mt-1">请联系管理员在后台设置</p>
          </div>
        )}
      </section>

      {/* 3. 天气 */}
      <section
        className="relative rounded-2xl p-4 border"
        style={{
          borderColor: `${colors.mist}`,
          background:
            'linear-gradient(135deg, rgba(214,232,240,0.45) 0%, rgba(250,251,247,0.95) 100%)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-full"
              style={{ background: `${colors.sky}33` }}
            >
              <Waves className="w-4 h-4" style={{ color: colors.sky }} />
            </span>
            <h3
              className="text-sm font-semibold tracking-wide"
              style={{ color: colors.ink }}
            >
              沿途天气
            </h3>
          </div>
          <button
            type="button"
            onClick={updateWeather}
            className="flex items-center gap-1 text-xs transition-all duration-300 hover:opacity-80 active:scale-95"
            style={{ color: colors.ink, opacity: 0.6 }}
            aria-label="刷新天气"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{updateTimeStr} 更新</span>
          </button>
        </div>
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(3, cities.length)}, minmax(0,1fr))`,
          }}
        >
          {cities.slice(0, 3).map((city, idx) => {
            const w = weathers[idx]
            return (
              <div
                key={city}
                className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: 'rgba(250,251,247,0.85)',
                  border: `1px solid ${colors.mist}`,
                }}
              >
                <div
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: colors.ink }}
                >
                  <MapPin className="w-3 h-3" style={{ color: colors.bloom }} />
                  <span className="truncate max-w-[3.5rem]">{city}</span>
                </div>
                <WeatherIcon kind={w.kind} className="w-7 h-7" />
                <div className="flex items-center gap-0.5">
                  <Thermometer
                    className="w-3 h-3"
                    style={{ color: colors.ink, opacity: 0.55 }}
                  />
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: colors.ink }}
                  >
                    {w.temp}°
                  </span>
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: colors.ink, opacity: 0.55 }}
                >
                  {w.label}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 4. 统计 */}
      <section
        className="relative rounded-2xl p-4 border"
        style={{
          borderColor: `${colors.sakura}66`,
          background:
            'linear-gradient(135deg, rgba(250,251,247,0.95) 0%, rgba(245,220,224,0.35) 100%)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full"
            style={{ background: `${colors.bloom}33` }}
          >
            <Sparkles className="w-4 h-4" style={{ color: colors.bloom }} />
          </span>
          <h3
            className="text-sm font-semibold tracking-wide"
            style={{ color: colors.ink }}
          >
            我们的进度
          </h3>
        </div>

        <div className="space-y-3.5">
          <ProgressRow
            label="已点亮省份"
            value={provincesLit}
            total={totalProvinces}
            percent={provincePct}
            fromColor={colors.bloom}
            toColor={colors.sakura}
          />
          <ProgressRow
            label="已留下回忆城市"
            value={citiesWithMemories}
            total={totalCities}
            percent={cityPct}
            fromColor={colors.sky}
            toColor={colors.mist}
          />
        </div>
      </section>
    </aside>
  )
}

function ProgressRow({
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
          style={{ color: colors.ink, opacity: 0.85 }}
        >
          {label}
        </span>
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: colors.ink }}
        >
          {value}
          {total > 0 && (
            <span style={{ opacity: 0.5 }}> / {total}</span>
          )}
        </span>
      </div>
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ background: `${colors.ink}14` }}
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
