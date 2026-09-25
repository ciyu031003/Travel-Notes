'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ShieldAlert } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { Button } from '@/components/mobile/Button'
import { LoaderBlock } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import type { SpaceOverview } from '@/lib/modules/space/space-overview.types'
import { SpaceThemeScope } from './SpaceThemeScope'
import SpaceDetail, { type SpaceDetailData } from './SpaceDetail'

type LoadState = 'loading' | 'ready' | 'denied' | 'notfound' | 'unauthenticated' | 'error'

/**
 * 空间详情（客户端壳）。
 *
 * 为什么详情页是客户端组件而不是服务端组件：移动端壳是 `output: 'export'` 静态站点，
 * 服务端组件在导出构建里无法工作（见 `app/space/[slug]/page.tsx` 的说明）。
 * 这里把「取数 + 权限结果」收敛成 6 个明确状态，两端共用：
 *   loading / ready / denied(403) / notfound(404) / unauthenticated(401) / error(其他)
 *
 * 权限仍由服务端裁决 —— 403 是服务端给的，不是前端藏按钮。
 */
export default function SpaceDetailClient() {
  const params = useParams<{ slug: string }>()
  const slug = typeof params?.slug === 'string' ? decodeURIComponent(params.slug) : ''

  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<SpaceDetailData | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!slug) {
      setState('notfound')
      return
    }
    setState('loading')
    try {
      const res = await fetch(apiUrl(`/api/spaces/by-slug/${encodeURIComponent(slug)}`), {
        credentials: 'include',
      })
      if (res.status === 401) {
        setState('unauthenticated')
        return
      }
      if (res.status === 403) {
        setState('denied')
        return
      }
      if (res.status === 404) {
        setState('notfound')
        return
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setMessage(j.error || '获取失败')
        setState('error')
        return
      }
      const overview = (await res.json()) as SpaceOverview
      setData({
        space: overview.space,
        stats: overview.stats,
        travels: overview.travels,
        albums: overview.albums,
        memories: overview.memories,
        upcoming: overview.upcoming,
        activity: overview.activity,
        members: overview.members,
      })
      setState('ready')
    } catch {
      setMessage('网络错误，请重试')
      setState('error')
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (state === 'loading') {
    return (
      <div className="m-gutter pt-2">
        <LargeTitle title="空间" back="/space" />
        <LoaderBlock label="正在打开空间…" />
      </div>
    )
  }

  if (state === 'unauthenticated') {
    return (
      <MessageState
        title="需要登录"
        description="空间内容只对登录用户开放。"
        action={<Button href={`/login?redirect=${encodeURIComponent(`/space/${slug}`)}`}>去登录</Button>}
      />
    )
  }

  if (state === 'denied') {
    return (
      <MessageState
        title="你还不是这个空间的成员"
        description="空间内容只对成员开放。如果你有邀请码，可以在空间列表里输入加入。"
        action={<Button href="/space">回空间列表</Button>}
      />
    )
  }

  if (state === 'notfound') {
    return (
      <MessageState
        title="没有找到这个空间"
        description="链接可能已失效，或者空间已被解散。"
        action={<Button href="/space">回空间列表</Button>}
      />
    )
  }

  if (state === 'error' || !data) {
    return (
      <MessageState
        title="加载失败"
        description={message || '请稍后重试。'}
        action={<Button onClick={() => void load()}>重试</Button>}
      />
    )
  }

  return (
    <SpaceThemeScope type={data.space.spaceType}>
      <SpaceDetail data={data} onChanged={() => void load()} />
    </SpaceThemeScope>
  )
}

function MessageState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="m-gutter pb-24 pt-2">
      <LargeTitle title={title} back="/space" />
      <div className="mt-10 flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-[var(--m-radius-card)] bg-[var(--social-surface2)] text-[var(--social-faint)]">
          <Icon icon={ShieldAlert} size="lg" />
        </span>
        <p className="mt-3 max-w-[280px] text-[13px] leading-5 text-[var(--social-muted)]">{description}</p>
        <div className="mt-5">{action}</div>
      </div>
    </div>
  )
}
