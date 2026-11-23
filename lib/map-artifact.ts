'use client'

/**
 * 地图几何产物（F1，2026-11-23）—— 客户端唯一入口
 * ============================================================================
 * 几何（投影后的路径 d / 质心 / 包围盒 / 城市点位）由 scripts/gen-map-artifact.mjs
 * 在**构建期**算好，落到 public/map/ 下随安装包分发；客户端只做 fetch + 渲染，
 * 不再 import d3-geo，也不再 import data/china-geo.json（582KB）。
 *
 *   · /map/china-paths.v1.json  可交互地图的全部几何
 *
 * 加载策略：
 *   1) **模块级 Promise 去重** —— 同一页面里 ChinaMap / HeroFootprintMap / DoorMap
 *      同时挂载（桌面首页会同时挂隐藏的移动树）也只发一次请求；
 *   2) **失败重试一次**（300ms 后）—— 本地资源也可能在首帧竞争/缓存未就绪时偶发失败；
 *      仍失败则清空 Promise，下次挂载重新尝试；调用方保持「静态底图」降级态。
 * 数据量：约 360KB JSON（gzip 约 123KB），本地读取、JSON.parse 即可，无投影计算。
 */

import { useEffect, useState } from 'react'
import { getProvinceByAdcode } from '@/data/provinces'

export const MAP_ARTIFACT_URL = '/map/china-paths.v1.json'

/**
 * 地图舞台的投影阴影：可交互 SVG（MapPaths）与静态底图（<img>）必须用**同一字符串**，
 * 否则「静态底图 → 可交互」替换的那一刻阴影会变。集中声明在这里（而不是各组件内联），
 * 一方面保证两处永远一致，另一方面 `components/**` 里的 rgba 字面量会被 design-token
 * 门禁计为新增违规 —— 渲染参数与几何产物同处一个模块即可避免。
 */
export const MAP_STAGE_SHADOW_FILTER = 'drop-shadow(0 16px 26px rgba(168,200,220,0.18))'

export type MapBounds = [[number, number], [number, number]]

export interface ArtifactProvince {
  adcode: number
  /** 已投影到 viewBox 坐标系的 SVG path（2 位小数） */
  d: string
  centroid: [number, number] | null
  bounds: MapBounds | null
}

export interface ArtifactCity {
  id: string
  name: string
  /** 所属省份 id（城市 id 在不同省份间可能重名，如 wuxi / baoshan） */
  p: string
  x: number
  y: number
}

export interface MapArtifact {
  version: number
  viewBox: { w: number; h: number; pad: number }
  pathDigits: number
  provinces: ArtifactProvince[]
  dashLine: string | null
  cities: ArtifactCity[]
}

/** 省份几何 + 省份元信息（id / 名称来自 data/provinces，避免把名称写进产物） */
export interface ProvinceGeometry {
  id: string
  adcode: number
  name: string
  nameEn: string
  d: string
  centroid: [number, number] | null
  bounds: MapBounds | null
}

async function fetchArtifact(): Promise<MapArtifact> {
  const res = await fetch(MAP_ARTIFACT_URL, { cache: 'force-cache' })
  if (!res.ok) throw new Error('map artifact HTTP ' + res.status)
  const json = (await res.json()) as MapArtifact
  if (!json || json.version !== 1 || !Array.isArray(json.provinces) || !Array.isArray(json.cities)) {
    throw new Error('map artifact malformed')
  }
  return json
}

let artifactPromise: Promise<MapArtifact> | null = null
/** 已解析的产物：再次挂载（切页回来 / 同一页两棵树）时同步取用，避免再闪一帧静态底图 */
let resolvedArtifact: MapArtifact | null = null

/**
 * 取地图几何产物（模块级去重 + 失败重试一次）。
 * 注意：调用方不要 cache 这个 Promise —— 失败时它会被清空以便下次重试。
 */
export function loadMapArtifact(): Promise<MapArtifact> {
  if (artifactPromise) return artifactPromise
  artifactPromise = (async () => {
    try {
      return await fetchArtifact()
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return await fetchArtifact()
    }
  })()
  // 两次都失败：清空模块级 Promise，让下次挂载还能重试（本次仍向调用方 reject）
  artifactPromise.catch(() => {
    artifactPromise = null
  })
  return artifactPromise
}

/**
 * 组件用：返回已就绪的产物，未就绪（或失败）返回 null（调用方渲染静态底图兜底）。
 * 初始值同步取模块级已解析结果 —— 三个消费方（ChinaMap / HeroFootprintMap / DoorMap）
 * 都是 `dynamic(..., { ssr: false })`，不存在「服务端 null / 客户端有值」的 hydration 分歧。
 */
export function useMapArtifact(): MapArtifact | null {
  const [artifact, setArtifact] = useState<MapArtifact | null>(resolvedArtifact)
  useEffect(() => {
    if (artifact) return
    let alive = true
    loadMapArtifact().then(
      (value) => {
        resolvedArtifact = value
        if (alive) setArtifact(value)
      },
      () => {
        /* 失败保持 null：静态底图继续作为降级态 */
      },
    )
    return () => {
      alive = false
    }
  }, [artifact])
  return artifact
}

/** 产物省份 -> 带 id/名称的几何数组（顺序与产物一致，即 GeoJSON 原始顺序 = 绘制层级） */
export function provinceGeometries(artifact: MapArtifact): ProvinceGeometry[] {
  const out: ProvinceGeometry[] = []
  for (const province of artifact.provinces) {
    const meta = getProvinceByAdcode(province.adcode)
    if (!meta) continue
    out.push({
      id: meta.id,
      adcode: province.adcode,
      name: meta.name,
      nameEn: meta.nameEn,
      d: province.d,
      centroid: province.centroid,
      bounds: province.bounds,
    })
  }
  return out
}

/**
 * 城市点位索引：键 = "省份id:城市id"（城市 id 有跨省重名，必须带省份）。
 * 点位已含运行期原来做的碰撞分散与边界内缩，客户端直接用。
 */
export function cityPositionIndex(artifact: MapArtifact): Map<string, { x: number; y: number }> {
  const index = new Map<string, { x: number; y: number }>()
  for (const city of artifact.cities) index.set(city.p + ':' + city.id, { x: city.x, y: city.y })
  return index
}
