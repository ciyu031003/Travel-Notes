'use client'

import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { useSessionRedirect } from '@/hooks/use-session-redirect'
import AsyncState from '@/components/AsyncState'
import UserList from '@/components/social/UserList'

/**
 * 我的粉丝 / 我的关注 共用页。
 *
 * 旧实现（两个文件各自一份）的缺陷：直接 `fetch('/api/me').then(r => r.json())`，
 * 未登录时中间件返回 307 → /login，拿到 HTML 后 `.json()` 抛错被 `.catch(() => {})` 吞掉
 * → `id` 永远为 null → 渲染「加载中…」转圈不止（与「我的」页同一个根因）。
 * 现在改用统一取数层 + 会话失效引导。
 */
export default function MeUserRelationPage({
  endpoint,
  title,
}: {
  endpoint: 'followers' | 'following'
  title: string
}) {
  const { data, error, loading, reload } = useApi<{ id?: number }>(apiUrl('/api/me'))
  const expired = useSessionRedirect(error)
  const id = data?.id ?? null

  if (expired) return <AsyncState variant="loading" message="登录状态已失效，正在跳转登录…" />
  if (error) {
    return (
      <AsyncState variant="error" title={`${title}加载失败`} message={error} actionLabel="重试" onAction={reload} />
    )
  }
  if (loading || !id) return <AsyncState variant="loading" message={`正在加载${title}…`} />
  return <UserList endpoint={`/api/social/users/${id}/${endpoint}`} title={title} />
}
