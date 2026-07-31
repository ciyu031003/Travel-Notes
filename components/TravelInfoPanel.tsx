'use client'

import { useEffect, useMemo, useState } from 'react'
import AnniversarySection from './travel-info/AnniversarySection'
import ClockSection from './travel-info/ClockSection'
import StatsSection from './travel-info/StatsSection'
import WeatherSection from './travel-info/WeatherSection'
import { TravelInfoColors, daysBetween, seedWeatherFor } from './travel-info/types'

interface TravelInfoPanelProps {
  anniversaryStart?: string
  cities?: string[]
  provincesLit?: number
  totalProvinces?: number
  citiesWithMemories?: number
  totalCities?: number
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

  return (
    <aside
      className="relative w-full h-full flex flex-col gap-3 p-4 rounded-3xl border border-[#D6E8F0]/70 bg-[#FAFBF7]/85 backdrop-blur-md shadow-[0_12px_40px_-12px_rgba(90,102,112,0.18)] overflow-y-auto"
      style={{ fontFamily: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-50"
        style={{ background: TravelInfoColors.sakura }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-8 w-40 h-40 rounded-full blur-3xl opacity-40"
        style={{ background: TravelInfoColors.mist }}
      />

      <ClockSection now={now} />
      <AnniversarySection
        anniversaryStart={anniversaryStart}
        daysTogether={daysTogether}
      />
      <WeatherSection
        cities={cities}
        weathers={weathers}
        weatherUpdatedAt={weatherUpdatedAt}
        onUpdateWeather={updateWeather}
      />
      <StatsSection
        provincesLit={provincesLit}
        totalProvinces={totalProvinces}
        citiesWithMemories={citiesWithMemories}
        totalCities={totalCities}
      />
    </aside>
  )
}
