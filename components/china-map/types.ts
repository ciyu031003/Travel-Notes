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
