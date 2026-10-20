/**
 * 旅行圈 feed 缓存（多副本收尾 · task-33 ③）。
 *
 * 背景：`listSocialFeed` 的 recommended 分支把「500 条候选 + 热度分」缓存 60s。
 * 原实现直接用 `appCache`（进程内 Map）且**写操作后不失效**：
 *  · 单实例：用户点赞/评论后最多 60s 内看到的还是旧排序/旧计数；
 *  · 多副本：A 副本的写入只影响 A 的缓存，B 副本 60s 内仍是旧数据。
 *
 * 现在统一走 `CacheService` + tag `social-feed`：
 *  · 未配置 REDIS_URL → 仍是进程内内存缓存（行为与改造前一致，只是写后会立即失效）；
 *  · 配置 REDIS_URL → tag 失效跨副本共享（一处写，全副本立刻重算）。
 *
 * 失效是**旁路**：失败只记日志，绝不让写操作失败。
 */
import { getCacheService } from '../../infrastructure/cache-factory'

/** feed 缓存 tag（写操作统一失效这个 tag） */
export const SOCIAL_FEED_CACHE_TAG = 'social-feed'

/** feed 缓存 TTL（秒）：兜底用，正常路径靠写后失效 */
export const SOCIAL_FEED_CACHE_TTL_SECONDS = 60

/** 取缓存服务（未配 REDIS_URL 时就是原来的内存实现） */
export function getSocialFeedCache() {
  return getCacheService()
}

/**
 * 失效旅行圈 feed 缓存。
 * 调用点：点赞/收藏/评论/帖子标题、以及 TravelPost 的发布/取消发布等写操作之后。
 */
export async function invalidateSocialFeedCache(): Promise<void> {
  try {
    await getCacheService().deleteByTag(SOCIAL_FEED_CACHE_TAG)
  } catch (err) {
    // 缓存失效失败不能回滚已经成功的写操作；只留痕
    console.error('[social] feed 缓存失效失败（不阻断写操作）', (err as Error)?.message || err)
  }
}
