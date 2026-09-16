'use client'

import MeHome from '@/components/social/MeHome'
import AsyncState from '@/components/AsyncState'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { useSessionRedirect } from '@/hooks/use-session-redirect'

export default function MePage() {
  // 阶段 A · A2：统一取数层（/api/me 为 ok() 包装，useApi 已自动解包 data）
  const { data: profile, error, loading, reload } = useApi<any>(apiUrl('/api/me'))
  // 会话失效（apiFetch 把 307→/login 归一成 401）→ 直接送登录页并带回跳地址，
  // 不让用户对着转圈图标猜（未登录点「我的」永远转圈的真机 bug 的根治点之一）。
  const expired = useSessionRedirect(error)

  if (expired) {
    return <AsyncState variant="loading" message="登录状态已失效，正在跳转登录…" />
  }
  if (error) {
    return (
      <AsyncState
        variant="error"
        message={error}
        title="个人档案加载失败"
        actionLabel="重试"
        onAction={reload}
      />
    )
  }
  if (loading || !profile) {
    return <AsyncState variant="loading" message="正在加载你的旅行档案…" />
  }
  return <MeHome initial={profile} />
}
