'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/lib/api-base'
import { findCityByName } from '@/data/cities'
import { formatDotDate } from '@/lib/modules/album/presentation'
import { readLocalAlbums } from '@/lib/modules/offline/album-read'
import { persistSoon, readPersistedCache, useIsomorphicLayoutEffect } from '@/lib/client/persisted-cache'

/**
 * 相册页取数/派生数据（P2-32 拆分自 app/album/page.tsx；E1 加入落盘水合）
 *
 * 行为与拆分前一致（原行为契约）：
 * - 挂载时 GET /api/album；成功 → 解锁态 + cities/albums，默认选中第一座城市；
 * - 非 2xx（在线但未解锁）或网络异常 → 回退本地离线相册缓存 readLocalAlbums()；
 * - finally 统一关闭「检查锁」与 loading（与原实现相同，避免骨架屏卡住）；
 * - 不做轮询（原实现也没有轮询）、不引入 SWR。
 *
 * E1 新增（2026-11-21 · 本地优先水合）：把最近一次成功响应落 localStorage，
 * 挂载时在水合提交后、首帧绘制前同步读回来 —— 像素/银河模式打开不再先空转一轮网络。
 *  · 只在**服务端 2xx 且已解锁**的分支落盘（离线兜底/未解锁不写，避免把「锁着」的状态固化）；
 *  · 快照新鲜期取 30 分钟（比其它接口短）：相册内容变化频繁，且这类数据比列表更敏感，
 *    过期后就走正常网络流程，不会长期展示旧图；
 *  · 有快照也照常刷新（refresh 在 mount 时总会跑），快照只负责「先给内容」。
 */

/** 持久化快照 key（沿用接口 path 作为 key，与 useApi 一致） */
const PERSIST_KEY = '/api/album'
/** 相册快照新鲜期：比其它接口短，见文件头说明 */
const PERSIST_TTL_MS = 30 * 60 * 1000

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

interface PersistedAlbumData {
  cities: AlbumCity[]
  albums: AlbumItem[]
}

/** 同步读相册快照（失败/过期一律 null，绝不抛） */
function readPersistedAlbum(): PersistedAlbumData | null {
  const hit = readPersistedCache<PersistedAlbumData>(PERSIST_KEY, { ttlMs: PERSIST_TTL_MS })
  const value = hit?.value
  if (!value || !Array.isArray(value.cities) || !Array.isArray(value.albums)) return null
  return value
}

/**
 * @param opts.enabled 是否立刻拉取 /api/album。相册默认的「旅行画册」（book）模式
 *   完全不用相册解锁数据（画册数据来自 /api/travel-book），传 false 可省掉这次往返；
 *   进入像素/银河模式时再翻成 true 触发拉取。默认 true（行为与旧版一致）。
 */
export function useAlbumData(opts: { enabled?: boolean } = {}): AlbumDataState {
  const enabled = opts.enabled !== false
  const [cities, setCities] = useState<AlbumCity[]>([])
  const [albums, setAlbums] = useState<AlbumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [checkingLock, setCheckingLock] = useState(true)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [selectedCity, setSelectedCity] = useState<AlbumCity | null>(null)
  /** 快照只水合一次（enabled 从 false 翻 true 时不该再覆盖用户刚操作出来的状态） */
  const hydratedRef = useRef(false)

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
        const nextCities: AlbumCity[] = data.cities || []
        const nextAlbums: AlbumItem[] = data.albums || []
        setIsUnlocked(true)
        setCities(nextCities)
        setAlbums(nextAlbums)
        if (nextCities.length > 0) {
          setSelectedCity(nextCities[0])
        }
        // 只有「已解锁 + 正常响应」才落盘：离线兜底/未解锁不写，避免把锁状态固化成本地快照
        persistSoon(PERSIST_KEY, { cities: nextCities, albums: nextAlbums } satisfies PersistedAlbumData)
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

  /**
   * 水合后、首次绘制前：同步读 localStorage 快照 → 有数据就直接进相册墙，不再等 /api/album。
   * 必须放在 layout effect（不能进 useState 初始化器），否则首帧与服务端 HTML 不一致。
   */
  useIsomorphicLayoutEffect(() => {
    if (!enabled || hydratedRef.current) return
    hydratedRef.current = true
    const persisted = readPersistedAlbum()
    if (!persisted) return
    setCities(persisted.cities)
    setAlbums(persisted.albums)
    setIsUnlocked(true)
    setSelectedCity(persisted.cities[0] ?? null)
    setCheckingLock(false)
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [enabled, refresh])

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
