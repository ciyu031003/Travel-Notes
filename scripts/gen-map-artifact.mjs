#!/usr/bin/env node
/**
 * 地图几何「预计算进安装包」（F1，2026-11-23）
 * ============================================================================
 * 背景：客户端组件（ChinaMap / HeroFootprintMap / DoorMap）曾经 import lib/geo.ts，
 * 于是 d3-geo + data/china-geo.json（582KB 明文 / 约 202KB gz）被编译成独立 chunk
 * 进客户端 bundle —— 首屏/切页都要为它付下载 + 解析 + 投影计算。
 *
 * 现在把「投影 + 裁剪 + 城市点位 + 包围盒」全部挪到构建期，产出一个静态资源：
 *   public/map/china-paths.v1.json —— 可交互地图所需的全部几何（路径 d / 质心 / 包围盒 / 城市点）
 * 产物随安装包（public/ 到 www/）一起分发：本地读取、零网络、零投影计算。
 *
 * 为什么没有「静态底图 SVG」：实测同一环境下 JSON 先到（19.9ms，126KB gzip）而
 * 335KB 的静态 SVG 后到（30.8ms + 图片解码），它反而永远在可交互图之后，
 * 白付一份 335KB（gzip 115KB）的安装包体积与一次栅格化 —— 故只保留 JSON 直出。
 *
 * 投影/裁剪逻辑与 lib/geo.ts 完全一致（同一 d3-geo 版本、同一 fitExtent padding、
 * 同一 fixWinding、同一 pathGen），只把 pathGen 的小数位从默认 3 位降到 2 位以控体积
 * （viewBox 1100x860 下 0.01 单位约 0.0035px，肉眼不可见）。
 *
 * 用法：
 *   node scripts/gen-map-artifact.mjs          # 生成并打印体积报告
 *   node scripts/gen-map-artifact.mjs --check  # 只校验已有产物是否与源码同步（CI 用）
 * 幂等：同样的输入永远产出同样的字节（无时间戳、无随机、无平台差异）。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { geoArea, geoMercator, geoPath } from 'd3-geo'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT_DIR = path.join(ROOT, 'public', 'map')
const OUT_JSON = path.join(OUT_DIR, 'china-paths.v1.json')

/** 与 components/ChinaMap.tsx / components/china-map/MapPaths.tsx 的 viewBox 对齐 */
const WIDTH = 1100
const HEIGHT = 860
const PADDING = 24
/** 路径精度（2 位小数 = 控体积；d3 默认 3 位） */
const PATH_DIGITS = 2
/** 城市点碰撞分散参数：与 ChinaMap 旧实现的运行期参数逐一对齐（MIN_DIST 16 / PAD 40 / 24 轮） */
const CITY_MIN_DIST = 16
const CITY_PAD = 40
const CITY_SPREAD_ITERS = 24

const CHECK_ONLY = process.argv.includes('--check')

const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const round2 = (n) => Math.round(n * 100) / 100

/* ────────────────────────────── 读取源码数据 ────────────────────────────── */

/**
 * 逐字段解析一个数据字面量行：`{ id: 'x', name: "y", lat: 1.2, lng: 3.4 }`
 *
 * 为什么不用「整行一条大正则」：data/cities.ts 里有 11 个城市的 nameEn 用**双引号**
 * （名字里带撇号，如 "Xi'an" / "Pu'er" / "Jing'an"），单引号写死的正则会把它们
 * 静默漏掉 —— 少 11 个城市点、8 个省的碰撞分散结果也会跟着变。逐字段解析对
 * 引号风格/字段顺序/多余字段都不敏感，再用「花括号数量」做交叉校验兜底。
 */
function parseFields(line) {
  const fields = {}
  for (const m of line.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*:\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))/g)) {
    fields[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : Number(m[4])
  }
  return fields
}

/** data/provinces.ts 里的 { id: "x", adcode: N, name: "…", nameEn: "…" } */
function parseProvinces() {
  const out = []
  for (const line of readText('data/provinces.ts').split(/\r?\n/)) {
    if (!/^ {2}\{\s*id:/.test(line)) continue
    const f = parseFields(line)
    if (typeof f.id !== 'string' || typeof f.adcode !== 'number') continue
    out.push({ id: f.id, adcode: f.adcode, name: String(f.name), nameEn: String(f.nameEn) })
  }
  if (out.length === 0) throw new Error('解析 data/provinces.ts 失败：0 个省份')
  return out
}

/** data/cities.ts 的 CITIES_BY_PROVINCE（保持声明顺序：顺序影响碰撞分散结果） */
function parseCities() {
  const src = readText('data/cities.ts')
  // 交叉校验用的期望值：显式声明「id:」的城市条目数（不含接口声明与辅助函数）
  const blockStart = src.indexOf('export const CITIES_BY_PROVINCE')
  if (blockStart < 0) throw new Error('data/cities.ts 里找不到 CITIES_BY_PROVINCE')
  const expected = (src.slice(blockStart).match(/\{\s*id:\s*['"]/g) || []).length

  const byProvince = new Map()
  let current = null
  for (const line of src.split(/\r?\n/)) {
    const head = line.match(/^ {2}([a-z0-9_-]+):\s*\[\s*$/)
    if (head) { current = head[1]; byProvince.set(current, []); continue }
    if (current && /^ {2}\],?\s*$/.test(line)) { current = null; continue }
    if (!current || !/^\s*\{\s*id:/.test(line)) continue
    const f = parseFields(line)
    if (typeof f.id !== 'string' || typeof f.lat !== 'number' || typeof f.lng !== 'number') continue
    byProvince.get(current).push({ id: f.id, name: String(f.name), lat: f.lat, lng: f.lng })
  }
  let total = 0
  for (const list of byProvince.values()) total += list.length
  if (byProvince.size === 0 || total === 0) throw new Error('解析 data/cities.ts 失败：0 个城市')
  if (total !== expected) {
    throw new Error('解析 data/cities.ts 数量不一致：解析到 ' + total + ' 个，声明 ' + expected + ' 个（数据格式可能变了，请检查解析器）')
  }
  return { byProvince, total }
}

/* ──────────────────── 与 lib/geo.ts 完全一致的投影/裁剪逻辑 ──────────────────── */

function fixWinding(feature) {
  if (geoArea(feature) <= 2 * Math.PI) return feature
  const geom = feature.geometry
  if (geom.type === 'Polygon') {
    geom.coordinates = geom.coordinates.map((ring, i) => (i === 0 ? ring.slice().reverse() : ring.slice()))
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates = geom.coordinates.map((poly) => poly.map((ring, i) => (i === 0 ? ring.slice().reverse() : ring.slice())))
  }
  return feature
}

function build() {
  const provinces = parseProvinces()
  const parsedCities = parseCities()
  const citiesByProvince = parsedCities.byProvince
  const cityTotal = parsedCities.total
  const adcodeToProvinceId = new Map(provinces.map((p) => [p.adcode, p.id]))

  const rawChina = JSON.parse(readText('data/china-geo.json'))

  const chinaFeatures = rawChina.features
    .filter(
      (f) =>
        adcodeToProvinceId.has(f.properties.adcode) &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
    )
    .map(fixWinding)

  const rawDashLine = rawChina.features.find((f) => String(f.properties.adcode) === '100000_JD')
  const dashLineFeature = rawDashLine ? fixWinding(rawDashLine) : null

  // 与 lib/geo.ts 的 makeProjection(WIDTH, HEIGHT, PADDING) 同一调用
  const projection = geoMercator().fitExtent(
    [
      [PADDING, PADDING],
      [WIDTH - PADDING, HEIGHT - PADDING],
    ],
    { type: 'FeatureCollection', features: chinaFeatures },
  )
  const pathGen = geoPath(projection).digits(PATH_DIGITS)

  // 省份：d / centroid / bounds
  const provinceEntries = []
  for (const feature of chinaFeatures) {
    const id = adcodeToProvinceId.get(feature.properties.adcode)
    if (!id) continue
    const centroid = pathGen.centroid(feature)
    const bounds = pathGen.bounds(feature)
    const hasBounds = Array.isArray(bounds) && Number.isFinite(bounds[0][0]) && Number.isFinite(bounds[0][1])
    const hasCentroid = Array.isArray(centroid) && Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])
    provinceEntries.push({
      id,
      adcode: feature.properties.adcode,
      d: pathGen(feature) || '',
      centroid: hasCentroid ? [round2(centroid[0]), round2(centroid[1])] : null,
      bounds: hasBounds
        ? [
            [round2(bounds[0][0]), round2(bounds[0][1])],
            [round2(bounds[1][0]), round2(bounds[1][1])],
          ]
        : null,
    })
  }

  // 城市点：投影 -> 碰撞分散 -> 边界内缩（与 ChinaMap.getCityDotBase 同算法、同顺序）
  const cityEntries = []
  for (const province of provinces) {
    const list = citiesByProvince.get(province.id) || []
    const dots = []
    for (const city of list) {
      const p = projection([city.lng, city.lat])
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
      dots.push({ city, x: Number(p[0].toFixed(2)), y: Number(p[1].toFixed(2)) })
    }
    if (dots.length > 1) {
      for (let iter = 0; iter < CITY_SPREAD_ITERS; iter++) {
        let moved = false
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            let dx = dots[j].x - dots[i].x
            let dy = dots[j].y - dots[i].y
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < CITY_MIN_DIST) {
              moved = true
              if (dist === 0) { dx = 1; dy = 0; dist = 1 }
              const push = (CITY_MIN_DIST - dist) / 2
              const nx = dx / dist
              const ny = dy / dist
              dots[i].x -= nx * push
              dots[i].y -= ny * push
              dots[j].x += nx * push
              dots[j].y += ny * push
            }
          }
        }
        if (!moved) break
      }
    }
    for (const dot of dots) {
      cityEntries.push({
        id: dot.city.id,
        name: dot.city.name,
        p: province.id,
        x: round2(Math.max(CITY_PAD, Math.min(WIDTH - CITY_PAD, dot.x))),
        y: round2(Math.max(CITY_PAD, Math.min(HEIGHT - CITY_PAD, dot.y))),
      })
    }
  }

  const dashLine = dashLineFeature ? pathGen(dashLineFeature) || '' : ''

  const artifact = {
    version: 1,
    viewBox: { w: WIDTH, h: HEIGHT, pad: PADDING },
    pathDigits: PATH_DIGITS,
    provinces: provinceEntries.map((p) => ({ adcode: p.adcode, d: p.d, centroid: p.centroid, bounds: p.bounds })),
    dashLine: dashLine || null,
    cities: cityEntries,
  }
  return {
    artifact,
    provinceEntries,
    dashLine,
    stats: { provinces: provinceEntries.length, cities: cityEntries.length, sourceCityTotal: cityTotal },
  }
}


/* ────────────────────────────── 输出 / 校验 ────────────────────────────── */

const gzipSize = (buf) => zlib.gzipSync(buf, { level: 9 }).length
const kb = (n) => (n / 1024).toFixed(1) + 'KB'
const hashOf = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)

const built = build()
const jsonText = JSON.stringify(built.artifact)
const jsonBytes = Buffer.byteLength(jsonText)

const report = {
  provinces: built.stats.provinces,
  cities: built.stats.cities,
  sourceCityTotal: built.stats.sourceCityTotal,
  dashLineChars: built.dashLine ? built.dashLine.length : 0,
  jsonBytes,
  jsonGzip: gzipSize(Buffer.from(jsonText)),
  jsonSha: hashOf(Buffer.from(jsonText)),
}

if (CHECK_ONLY) {
  const problems = []
  if (!fs.existsSync(OUT_JSON)) problems.push('缺少 public/map/china-paths.v1.json')
  else if (fs.readFileSync(OUT_JSON, 'utf8') !== jsonText) problems.push('china-paths.v1.json 与源码不同步（请跑 npm run map:artifact）')
  if (problems.length) {
    for (const p of problems) console.error('[map:artifact] ' + p)
    process.exit(1)
  }
  console.log('[map:artifact] 产物已是最新 ' + JSON.stringify(report))
  process.exit(0)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(OUT_JSON, jsonText)

console.log('[map:artifact] 已生成 public/map/')
console.log('  省份 ' + report.provinces + ' 个 | 城市点 ' + report.cities + ' 个（源码城市 ' + report.sourceCityTotal + '）| 南海虚线 ' + (built.dashLine ? '有' : '无'))
console.log('  china-paths.v1.json  ' + kb(jsonBytes) + ' (gzip ' + kb(report.jsonGzip) + ') sha=' + report.jsonSha)
