import type { LucideIcon } from 'lucide-react'
import { TRANSPORT_ICON } from '@/lib/mobile/icon-system'
import type { TicketData, TicketTransport } from '@/lib/ticket/types'

/**
 * 票面零件的纯函数/无状态组件（不含任何布局语义）
 * ---------------------------------------------------------------------------
 * 只做三件事：
 *   1. 把 TicketData 里的字符串稳定地摊成「伪随机」图形（二维码 / 条形码）；
 *   2. 交通方式 → 图标/中文名；
 *   3. 三套票面共用的装饰件（二维码、条形码）。
 *
 * 为什么不用真二维码库：票面二维码是**装饰**，扫不出信息也不需要纠错，
 * 但必须「同一张票永远长一样」——所以用 FNV-1a 做种子 + mulberry32 出图，
 * 纯函数、无副作用、不新增依赖。
 */

/** FNV-1a 32bit：稳定、无依赖，同一串字符永远得到同一个数 */
function hash32(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32：由种子生成 0..1 的伪随机序列（同一 seed → 同一图形） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 票面唯一图形种子：换票号/日期即换图案，同一张票永远一致 */
export function ticketArtSeed(ticket: TicketData): string {
  return ticket.slug + '|' + ticket.number + '|' + ticket.date
}

/** 纸质票左侧蓝色竖条的流水号（稳定派生，不落库） */
export function ticketSerial(ticket: TicketData): string {
  return 'E' + String((hash32(ticketArtSeed(ticket)) % 900000) + 100000)
}

/* ── 插画天光的读屏描述 ───────────────────────────────────────────────
   票面不再显示「春 · 清晨」这类文字标签（用户明确要求用背景表达），但读屏
   用户依然需要知道这张票是哪个季节/天光 —— 所以把标签降级成 sr-only 文本，
   和插画一起描述。文字标签只是从视觉层消失，信息不丢。 */
const SEASON_SCENE: Record<TicketData['season'], string> = {
  spring: '花枝与飘落的花瓣、枝头露水',
  summer: '烈日与浓密树叶、地面光斑',
  autumn: '银杏叶与飘落的落叶、金色斜光',
  winter: '雪粒与霜白枯枝、雪原',
}

const DAYPART_SCENE: Record<TicketData['dayPart'], string> = {
  morning: '清晨低角度的柔光与薄雾',
  noon: '正午顶光与清晰的远山影子',
  dusk: '黄昏的暖橙紫渐变与飞鸟',
  evening: '夜晚的深蓝星空与月亮灯火',
}

/** 票面插画的一句读屏描述（视觉上不渲染） */
export function ticketSceneAlt(season: TicketData['season'], dayPart: TicketData['dayPart']): string {
  return SEASON_SCENE[season] + '，' + DAYPART_SCENE[dayPart] + '。'
}

/* 图标取自 icon-system 的「出行方式」映射（唯一入口），不在票面里另选图标 */
export const TRANSPORT_META: Record<TicketTransport, { icon: LucideIcon; label: string }> = {
  flight: { icon: TRANSPORT_ICON.PLANE, label: '机票' },
  hsr: { icon: TRANSPORT_ICON.TRAIN, label: '高铁' },
  train: { icon: TRANSPORT_ICON.TRAIN, label: '火车' },
}

/** 21×21 点阵的二维码路径（含三个定位角，纯展示） */
export function qrPath(seed: string, modules = 21): string {
  const rand = mulberry32(hash32(seed))
  const grid: boolean[][] = []
  for (let r = 0; r < modules; r++) {
    const row: boolean[] = []
    for (let c = 0; c < modules; c++) row.push(rand() > 0.52)
    grid.push(row)
  }

  const finder = (top: number, left: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        grid[top + r][left + c] = ring || core
      }
    }
  }
  finder(0, 0)
  finder(0, modules - 7)
  finder(modules - 7, 0)

  let d = ''
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (grid[r][c]) d += 'M' + c + ' ' + r + 'h1v1h-1z'
    }
  }
  return d
}

/** 条形码：1~3 单位宽的竖条，图幅按实际总宽返回（配 preserveAspectRatio="none" 拉伸） */
export function barcodePath(seed: string, bars = 38): { d: string; width: number } {
  const rand = mulberry32(hash32(seed + '|bars'))
  let x = 0
  let d = ''
  for (let i = 0; i < bars; i++) {
    const w = 1 + Math.floor(rand() * 3)
    const gap = 1 + Math.floor(rand() * 2)
    d += 'M' + x + ' 0h' + w + 'v1h-' + w + 'z'
    x += w + gap
  }
  return { d, width: x }
}

/**
 * 票面二维码（装饰）
 * 颜色一律 currentColor：具体颜色由外层 .tk-flight-qr / .tk-qr 等 class 决定，
 * 组件里不出现任何色值。
 */
export function TicketQr({ seed, className }: { seed: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 21 21"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={qrPath(seed)} fill="currentColor" />
    </svg>
  )
}

/** 票面条形码（装饰） */
export function TicketBarcode({ seed, className }: { seed: string; className?: string }) {
  const { d, width } = barcodePath(seed)
  return (
    <svg
      viewBox={'0 0 ' + width + ' 1'}
      preserveAspectRatio="none"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}
