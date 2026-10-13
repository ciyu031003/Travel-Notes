/** 社交互动：在线先落服务器；只有网络不可达才入离线队列，认证/业务错误不可假成功。 */
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { getOfflineDb } from './native/sqlite-db'
import { isNativePlatform } from './platform'
import { apiUrl } from '@/lib/api-base'

/** 本地实体 id：优先 randomUUID；老 WebView 无该 API 时退化为时间戳+随机串。 */
function localEntityId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* 非安全上下文等情况下退化 */ }
  return 'soc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

export interface SocialWriteResult {
  ok: boolean
  error?: string
  local?: boolean
  data?: Record<string, unknown>
}

async function writeSocial(
  postId: number | string,
  kind: 'LIKE' | 'FAVORITE' | 'COMMENT',
  enabled: boolean,
  payload: Record<string, unknown>,
): Promise<SocialWriteResult> {
  const suffix = kind === 'LIKE' ? 'like' : kind === 'FAVORITE' ? 'favorite' : 'comments'
  let offline = false
  try {
    const res = await fetch(apiUrl(`/api/social/posts/${postId}/${suffix}`), {
      method: enabled ? 'POST' : 'DELETE',
      credentials: 'include',
      cache: 'no-store',
      headers: kind === 'COMMENT' ? { 'Content-Type': 'application/json' } : undefined,
      body: kind === 'COMMENT' ? JSON.stringify(payload) : undefined,
    })
    if (res.redirected || res.status === 401 || res.status === 403) {
      return { ok: false, error: '登录已失效，请重新登录后操作' }
    }
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || json.success === false || json.error) {
      return { ok: false, error: json?.error || '操作未保存，请重试' }
    }
    return { ok: true, data: json.data }
  } catch {
    offline = true
  }
  if (!offline || !isNativePlatform()) return { ok: false, error: '网络错误，请重试' }
  try {
    // 队列只序列化一次；先持久入队，再更新可选的 feed 缓存。
    await new SyncQueue(getSyncQueueStorage()).enqueue({
      entityType: kind,
      entityId: localEntityId(),
      remoteId: null,
      operation: enabled ? 'CREATE' : 'DELETE',
      payload: { postId: Number(postId), ...payload },
    })
    const db = await getOfflineDb()
    if (kind === 'COMMENT') {
      await db.run('UPDATE social_post SET commentCount = commentCount + 1, updatedAt = ? WHERE remoteId = ?', [Date.now(), Number(postId)])
    } else {
      const field = kind === 'LIKE' ? 'isLiked' : 'isFavorited'
      await db.run(`UPDATE social_post SET ${field} = ?, updatedAt = ? WHERE remoteId = ?`, [enabled ? 1 : 0, Date.now(), Number(postId)])
    }
    return { ok: true, local: true }
  } catch {
    return { ok: false, error: '网络不可用且本地保存失败，请重试' }
  }
}

export function toggleLike(postId: number | string, liked: boolean): Promise<SocialWriteResult> {
  return writeSocial(postId, 'LIKE', liked, {})
}
export function toggleFavorite(postId: number | string, favorited: boolean): Promise<SocialWriteResult> {
  return writeSocial(postId, 'FAVORITE', favorited, {})
}
export function createComment(postId: number | string, content: string, parentId?: number | null): Promise<SocialWriteResult> {
  const trimmed = content.trim()
  if (!trimmed) return Promise.resolve({ ok: false, error: '评论不能为空' })
  if (parentId != null && (!Number.isInteger(parentId) || parentId <= 0)) {
    return Promise.resolve({ ok: false, error: '这条评论尚未同步，暂不能回复' })
  }
  return writeSocial(postId, 'COMMENT', true, { content: trimmed, parentId: parentId ?? null })
}
