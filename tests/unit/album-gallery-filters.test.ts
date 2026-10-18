import { describe, expect, it } from 'vitest'
import {
  collectAlbumCompanions,
  collectAlbumTypes,
  filterAlbums,
} from '@/components/album/album-gallery-filters'
import type { AlbumItem } from '@/hooks/use-album-data'

/**
 * P2-32 拆分回归：纪念相册的筛选纯函数从 album 页内联 useMemo 抽出，
 * 这里锁住与原实现一致的行为（类型筛选 / 同行者筛选 / 组合 / 空值）。
 */
function album(overrides: Partial<AlbumItem>): AlbumItem {
  return {
    id: 1,
    title: '测试相册',
    description: null,
    coverUrl: null,
    mediaCount: 0,
    date: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    travelType: null,
    companions: undefined,
    ...overrides,
  }
}

const ALBUMS: AlbumItem[] = [
  album({ id: 1, travelType: 'COUPLE', companions: [{ name: '小甜', relation: '女友' }] }),
  album({ id: 2, travelType: 'FAMILY', companions: [{ name: '妈妈', relation: '家人' }] }),
  album({ id: 3, travelType: 'COUPLE', companions: [{ name: '小甜', relation: '女友' }, { name: '阿途', relation: '朋友' }] }),
  album({ id: 4, travelType: null, companions: null }),
]

describe('album 纪念相册筛选（拆分自 app/album/page.tsx）', () => {
  it('collectAlbumTypes：去重、跳过空类型', () => {
    expect(collectAlbumTypes(ALBUMS)).toEqual(['COUPLE', 'FAMILY'])
  })

  it('collectAlbumCompanions：同名只保留首次出现的关系，跳过空名字', () => {
    expect(collectAlbumCompanions(ALBUMS)).toEqual([
      { name: '小甜', relation: '女友' },
      { name: '妈妈', relation: '家人' },
      { name: '阿途', relation: '朋友' },
    ])
  })

  it('filterAlbums：ALL + 无同行者 = 全部', () => {
    expect(filterAlbums(ALBUMS, 'ALL', null).map((a) => a.id)).toEqual([1, 2, 3, 4])
  })

  it('filterAlbums：按旅行类型筛选（空类型不匹配任何具体类型）', () => {
    expect(filterAlbums(ALBUMS, 'COUPLE', null).map((a) => a.id)).toEqual([1, 3])
  })

  it('filterAlbums：按同行者筛选，再叠加类型筛选取交集', () => {
    expect(filterAlbums(ALBUMS, 'ALL', '小甜').map((a) => a.id)).toEqual([1, 3])
    expect(filterAlbums(ALBUMS, 'FAMILY', '小甜').map((a) => a.id)).toEqual([])
  })

  it('filterAlbums：companions 为非数组脏数据时不影响筛选', () => {
    const dirty = [album({ id: 9, companions: 'not-json' as never })]
    expect(collectAlbumCompanions(dirty)).toEqual([])
    expect(filterAlbums(dirty, 'ALL', null).map((a) => a.id)).toEqual([9])
    expect(filterAlbums(dirty, 'ALL', '小甜')).toEqual([])
  })
})
