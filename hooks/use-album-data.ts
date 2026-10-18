'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl } from '@/lib/api-base'
import { findCityByName } from '@/data/cities'
import { formatDotDate } from '@/lib/modules/album/presentation'
import { readLocalAlbums } from '@/lib/modules/offline/album-read'

/**
 * 相册页取数/派生数据（P2-32 拆分自 app/album/page.tsx）
 *
 * 行为与拆分前完全一致（纯重构）：
 * - 挂载时 GET /api/album；成功 → 解锁态 + cities/albums，默认选中第一座城市；
 * - 非 2xx（在线但未解锁）或网络异常 → 回退本地离线相册缓存 readLocalAlbums()；
 * - finally 统一关闭「检查锁」与 loading（与原实现相同，避免骨架屏卡住）；
 * - 不做轮询（原实现也没有轮询）、不引入 SWR。
 */

export interface AlbumCityDay {
  date: string
  title: string
  images: string[]
}

export interface AlbumCity {
  name: string
  province: string
  provinceId: string
  images: string[]
  date: string
  postSlug: string
  days: AlbumCityDay[]
}

export interface AlbumItem {
  id: number
  title: string
  description: string | null
  coverUrl: string | null
  mediaCount: number
  date: string | null
  createdAt: string
  travelType?: string | null
  companions?: unknown
}

/** 同行者字段是 JSON 数组（历史数据可能不规范），消费方自己 String() 归一，保持原行为 */
export type AlbumCompanionInfo = { name?: unknown; relation?: unknown }

export function albumCompanionsOf(album: AlbumItem): AlbumCompanionInfo[] {
  return Array.isArray(album.companions) ? (album.companions as AlbumCompanionInfo[]) : []
}

export interface StarCity {
  name: string
  lat: number
  lng: number
  date: string
  count: number
}

export interface AlbumDataState {
  cities: AlbumCity[]
  albums: AlbumItem[]
  loading: boolean
  checkingLock: boolean
  isUnlocked: boolean
  selectedCity: AlbumCity | null
  setSelectedCity: (city: AlbumCity | null) => void
  /** 重新拉取（不主动置 loading，供新建/添加照片后的静默刷新） */
  refresh: () => Promise<void>
  /** 重新拉取并先置 loading（解锁成功后使用，保持原有转圈行为） */
  reload: () => void
  totalPhotos: number
  totalDays: number
  starCities: StarCity[]
}

export function useAlbumData(): AlbumDataState {
  const [cities, setCities] = useState<AlbumCity[]>([])
  const [albums, setAlbums] = useState<AlbumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [checkingLock, setCheckingLock] = useState(true)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [selectedCity, setSelectedCity] = useState<AlbumCity | null>(null)

  const applyOfflineAlbums = useCallback(async () => {
    const local = await readLocalAlbums()
    if (local) {
      setIsUnlocked(true)
      setAlbums(local as never[])
      setCities([])
      return
    }
    setIsUnlocked(false)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/album'))
      if (res.ok) {
        const data = await res.json()
        setIsUnlocked(true)
        setCities(data.cities || [])
        setAlbums(data.albums || [])
        if (data.cities && data.cities.length > 0) {
          setSelectedCity(data.cities[0])
        }
      } else {
        // 在线但未解锁：尝试本地缓存（离线兜底）
        await applyOfflineAlbums()
      }
    } catch {
      // 离线/失败：回退本地相册缓存
      await applyOfflineAlbums()
    } finally {
      setCheckingLock(false)
      setLoading(false)
    }
  }, [applyOfflineAlbums])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const reload = useCallback(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  const totalPhotos = useMemo(
    () => cities.reduce((sum, city) => sum + city.images.length, 0),
    [cities],
  )
  const totalDays = useMemo(
    () => cities.reduce((sum, city) => sum + (city.days?.length || 1), 0),
    [cities],
  )
  // 星图点数据：城市名 → 经纬度（data/cities 里查不到的城市直接跳过，与原实现一致）
  const starCities = useMemo(
    () =>
      cities
        .map((city) => {
          const match = findCityByName(city.name)
          if (!match) return null
          return {
            name: city.name,
            lat: match.lat,
            lng: match.lng,
            date: formatDotDate(city.date),
            count: city.images.length,
          }
        })
        .filter(Boolean) as StarCity[],
    [cities],
  )

  return {
    cities,
    albums,
    loading,
    checkingLock,
    isUnlocked,
    selectedCity,
    setSelectedCity,
    refresh,
    reload,
    totalPhotos,
    totalDays,
    starCities,
  }
}
