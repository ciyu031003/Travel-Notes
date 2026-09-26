/**
 * 旅行圈离线读（D2 社交离线）：从本地 SQLite 读 social_post 表，映射为与 /api/social/posts 一致的 Feed 项形状。
 * 供 /circle 页面用 readWithFallback 在离线/失败时回退本地。
 */
import { queryRows } from './dao'
import { rowGet } from './native/sqlite-db'
import { isNativePlatform } from './platform'

export interface LocalSocialPost {
  id: number | string
  title: string
  summary: string | null
  coverUrl: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  author: { id: number | null; username: string | null; nickname: string | null; avatarUrl: string | null } | null
  likeCount: number
  commentCount: number
  favoriteCount: number
  publishedAt: string | null
  isLiked: boolean
  isFavorited: boolean
}

function msToIso(ms: unknown): string | null {
  const n = Number(ms)
  if (!n) return null
  const d = new Date(n)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** 读本地旅行圈 Feed（原生端 + 表非空才返回，否则 null 交给 readWithFallback 走远端） */
export async function readLocalSocialFeed(): Promise<LocalSocialPost[] | null> {
  if (!isNativePlatform()) return null
  try {
    const rows = await queryRows(
      'SELECT id, remoteId, title, summary, coverUrl, location, startDate, endDate, dayCount, photoCount, ' +
        'authorId, authorName, authorNickname, authorAvatar, likeCount, commentCount, favoriteCount, ' +
        'isLiked, isFavorited, publishedAt FROM social_post WHERE deleted = 0 ORDER BY COALESCE(publishedAt, updatedAt) DESC',
    )
    if (rows.length === 0) return null
    return rows.map((r) => {
      const remoteId = r[1] == null ? null : Number(r[1])
      const localId = String(r[0])
      return {
        id: remoteId ?? localId,
        title: String(r[2] ?? ''),
        summary: r[3] == null ? null : String(r[3]),
        coverUrl: r[4] == null ? null : String(r[4]),
        location: r[5] == null ? null : String(r[5]),
        startDate: msToIso(r[6]),
        endDate: msToIso(r[7]),
        dayCount: Number(r[8]) || 0,
        photoCount: Number(r[9]) || 0,
        author: r[10] == null ? null : {
          id: Number(r[10]),
          username: r[11] == null ? null : String(r[11]),
          nickname: r[12] == null ? null : String(r[12]),
          avatarUrl: r[13] == null ? null : String(r[13]),
        },
        likeCount: Number(r[14]) || 0,
        commentCount: Number(r[15]) || 0,
        favoriteCount: Number(r[16]) || 0,
        isLiked: !!r[17],
        isFavorited: !!r[18],
        publishedAt: msToIso(r[19]),
      }
    })
  } catch {
    return null
  }
}

/** 按 id 读本地旅行圈单帖（帖子详情离线回退用） */
export async function readLocalSocialPostById(postId: number | string): Promise<LocalSocialPost | null> {
  if (!isNativePlatform()) return null
  try {
    const rows = await queryRows(
      'SELECT id, remoteId, title, summary, coverUrl, location, startDate, endDate, dayCount, photoCount, ' +
        'authorId, authorName, authorNickname, authorAvatar, likeCount, commentCount, favoriteCount, ' +
        'isLiked, isFavorited, publishedAt FROM social_post WHERE (remoteId = ? OR id = ?) AND deleted = 0 LIMIT 1',
      [Number(postId), String(postId)],
    )
    const r = rows[0]
    if (!r) return null
    // 按列名取值（rowGet）：Android 返回列名对象，位置取值会整体错位
    const g = (name: string, index: number) => rowGet(r, name, index)
    const remoteId = g('remoteId', 1) == null ? null : Number(g('remoteId', 1))
    const authorId = g('authorId', 10)
    return {
      id: remoteId ?? String(g('id', 0)),
      title: String(g('title', 2) ?? ''),
      summary: g('summary', 3) == null ? null : String(g('summary', 3)),
      coverUrl: g('coverUrl', 4) == null ? null : String(g('coverUrl', 4)),
      location: g('location', 5) == null ? null : String(g('location', 5)),
      startDate: msToIso(g('startDate', 6)),
      endDate: msToIso(g('endDate', 7)),
      dayCount: Number(g('dayCount', 8)) || 0,
      photoCount: Number(g('photoCount', 9)) || 0,
      author: authorId == null ? null : {
        id: Number(authorId),
        username: g('authorName', 11) == null ? null : String(g('authorName', 11)),
        nickname: g('authorNickname', 12) == null ? null : String(g('authorNickname', 12)),
        avatarUrl: g('authorAvatar', 13) == null ? null : String(g('authorAvatar', 13)),
      },
      likeCount: Number(g('likeCount', 14)) || 0,
      commentCount: Number(g('commentCount', 15)) || 0,
      favoriteCount: Number(g('favoriteCount', 16)) || 0,
      isLiked: !!g('isLiked', 17),
      isFavorited: !!g('isFavorited', 18),
      publishedAt: msToIso(g('publishedAt', 19)),
    }
  } catch {
    return null
  }
}
