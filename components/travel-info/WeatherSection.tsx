'use client'

import { MapPin, RefreshCw, Thermometer, Waves } from 'lucide-react'
import WeatherIcon from './WeatherIcon'
import { pad2, TravelInfoColors, type WeatherInfo } from './types'

export default function WeatherSection({
  cities,
  weathers,
  weatherUpdatedAt,
  onUpdateWeather,
}: {
  cities: string[]
  weathers: WeatherInfo[]
  weatherUpdatedAt: Date
  onUpdateWeather: () => void
}) {
  const updateTimeStr = `${pad2(weatherUpdatedAt.getHours())}:${pad2(
    weatherUpdatedAt.getMinutes()
  )}`

  return (
    <section
      className="relative rounded-2xl p-4 border"
      style={{
        borderColor: `${TravelInfoColors.mist}`,
        background:
          'linear-gradient(135deg, rgba(214,232,240,0.45) 0%, rgba(250,251,247,0.95) 100%)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full"
            style={{ background: `${TravelInfoColors.sky}33` }}
          >
            <Waves className="w-4 h-4" style={{ color: TravelInfoColors.sky }} />
          </span>
          <h3
            className="text-sm font-semibold tracking-wide"
            style={{ color: TravelInfoColors.ink }}
          >
            沿途天气
          </h3>
        </div>
        <button
          type="button"
          onClick={onUpdateWeather}
          className="flex items-center gap-1 text-xs transition-all duration-300 hover:opacity-80 active:scale-95"
          style={{ color: TravelInfoColors.ink, opacity: 0.6 }}
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
                border: `1px solid ${TravelInfoColors.mist}`,
              }}
            >
              <div
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: TravelInfoColors.ink }}
              >
                <MapPin className="w-3 h-3" style={{ color: TravelInfoColors.bloom }} />
                <span className="truncate max-w-[3.5rem]">{city}</span>
              </div>
              <WeatherIcon kind={w.kind} className="w-7 h-7" />
              <div className="flex items-center gap-0.5">
                <Thermometer
                  className="w-3 h-3"
                  style={{ color: TravelInfoColors.ink, opacity: 0.55 }}
                />
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: TravelInfoColors.ink }}
                >
                  {w.temp}°
                </span>
              </div>
              <div
                className="text-[10px]"
                style={{ color: TravelInfoColors.ink, opacity: 0.55 }}
              >
                {w.label}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
