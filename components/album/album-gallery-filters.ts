import { albumCompanionsOf, type AlbumItem } from '@/hooks/use-album-data'

/**
 * 纪念相册的筛选纯函数（P2-32 从 album 页内联 useMemo 抽出，便于单测）。
 * 逻辑与原实现逐行等价：类型筛选取 travelType，同行者筛选取 companions[].name。
 */

export function collectAlbumTypes(albums: AlbumItem[]): string[] {
  const set = new Set<string>()
  for (const album of albums) if (album.travelType) set.add(album.travelType)
  return Array.from(set)
}

export function collectAlbumCompanions(albums: AlbumItem[]): Array<{ name: string; relation: string }> {
  const map = new Map<string, string>()
  for (const album of albums) {
    for (const companion of albumCompanionsOf(album)) {
      const name = String(companion?.name || '').trim()
      if (!name) continue
      if (!map.has(name)) map.set(name, String(companion?.relation || '').trim())
    }
  }
  return Array.from(map, ([name, relation]) => ({ name, relation }))
}

export function filterAlbums(
  albums: AlbumItem[],
  typeFilter: string,
  companionFilter: string | null,
): AlbumItem[] {
  return albums.filter((album) => {
    if (typeFilter !== 'ALL' && (album.travelType || '') !== typeFilter) return false
    if (companionFilter) {
      const names = albumCompanionsOf(album).map((companion) => String(companion?.name || '').trim())
      if (!names.includes(companionFilter)) return false
    }
    return true
  })
}
