import type { City } from '@/data/cities'
export interface PostMeta {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  tags?: string[]
  location?: string
}

export interface ProvincePath {
  id: string
  d: string
  name: string
  nameEn: string
  lit: boolean
  centroid: [number, number] | null
}

/** 省份内单个城市在地图上的投影圆点 */
export interface CityDot {
  city: City
  x: number
  y: number
  hasPosts: boolean
  count: number
}

export const ChinaMapColors = {
  cream: '#FAFBF7',
  dim: '#D8DDD8',
  ink: '#5A6670',
  sakura: '#F3E4D5',
  bloom: '#E4B478',
  sky: '#A8C8DC',
  mist: '#D6E8F0',
}

export const easyTapProvinceIds = new Set(['hongkong', 'macau'])
