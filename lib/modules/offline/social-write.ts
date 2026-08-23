/**
 * 旅行圈互动离线写（D2 社交离线写）：
 * - 原生壳：乐观更新本地 social_post（isLiked/isFavorited/计数）+ SyncQueue 入队
 *   （LIKE/FAVORITE 幂等、COMMENT 上传后回填），联网后 SyncEngine 自动上传。
 * - Web：直接走在线 /api/social/posts/[id]/like|favorite|comments。
 */
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { getOfflineDb } from './native/sqlite-db'
import { isNativePlatform } from './platform'
import { apiUrl } from '@/lib/api-base'

export interface SocialWriteResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
}

function randomId(): string {
  return crypto.randomUUID()
}

/** 点赞/取消点赞（幂等）：原生端乐观更新 + 入队；Web 在线 */
export async function toggleLike(postId: number | string, liked: boolean): Promise<SocialWriteResult> {
  if (isNativePlatform()) {
    const db = await getOfflineDb()
    const now = Date.now()
    const target = liked ? 1 : 0
    const delta = liked ? 1 : -1
    await db.run(
      'UPDATE social_post SET isLiked = ?, likeCount = MAX(0, likeCount + ?), updatedAt = ? WHERE remoteId = ?',
      [target, delta, now, Number(postId)],
    )
    const queue = new SyncQueue(getSyncQueueStorage())
    await queue.enqueue({
      entityType: 'LIKE',
      entityId: randomId(),
      remoteId: null,
      operation: liked ? 'CREATE' : 'DELETE',
      payload: JSON.stringify({ postId: Number(postId) }),
    })
    return { ok: true, local: true }
  }
  try {
    const res = await fetch(apiUrl(`/api/social/posts/${postId}/like`), {
      method: liked ? 'POST' : 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) return { ok: false, error: '操作失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}

/** 收藏/取消收藏（幂等） */
export async function toggleFavorite(postId: number | string, favorited: boolean): Promise<SocialWriteResult> {
  if (isNativePlatform()) {
    const db = await getOfflineDb()
    const now = Date.now()
    const target = favorited ? 1 : 0
    const delta = favorited ? 1 : -1
    await db.run(
      'UPDATE social_post SET isFavorited = ?, favoriteCount = MAX(0, favoriteCount + ?), updatedAt = ? WHERE remoteId = ?',
      [target, delta, now, Number(postId)],
    )
    const queue = new SyncQueue(getSyncQueueStorage())
    await queue.enqueue({
      entityType: 'FAVORITE',
      entityId: randomId(),
      remoteId: null,
      operation: favorited ? 'CREATE' : 'DELETE',
      payload: JSON.stringify({ postId: Number(postId) }),
    })
    return { ok: true, local: true }
  }
  try {
    const res = await fetch(apiUrl(`/api/social/posts/${postId}/favorite`), {
      method: favorited ? 'POST' : 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) return { ok: false, error: '操作失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}

/** 发表评论：原生端本地计数 + 入队（上传后回填 remoteId）；Web 在线 */
export async function createComment(postId: number | string, content: string): Promise<SocialWriteResult> {
  const trimmed = content.trim()
  if (!trimmed) return { ok: false, error: '评论不能为空' }
  if (isNativePlatform()) {
    const db = await getOfflineDb()
    const now = Date.now()
    await db.run(
      'UPDATE social_post SET commentCount = commentCount + 1, updatedAt = ? WHERE remoteId = ?',
      [now, Number(postId)],
    )
    const queue = new SyncQueue(getSyncQueueStorage())
    await queue.enqueue({
      entityType: 'COMMENT',
      entityId: randomId(),
      remoteId: null,
      operation: 'CREATE',
      payload: JSON.stringify({ postId: Number(postId), content: trimmed }),
    })
    return { ok: true, local: true }
  }
  try {
    const res = await fetch(apiUrl(`/api/social/posts/${postId}/comments`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || '评论失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}
