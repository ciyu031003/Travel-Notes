'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { Button } from '@/components/mobile/Button'
import { LoaderBlock } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import { spaceDetailHref } from '@/lib/routes'
import type { SpaceOverview } from '@/lib/modules/space/space-overview.types'
import { SpaceThemeScope } from '@/components/space/SpaceThemeScope'
import { SpacePlanSection } from '@/components/space/plans/SpacePlanSection'
import { SpacePlanDetail } from '@/components/space/plans/SpacePlanDetail'

type LoadState = 'loading' | 'ready' | 'denied' | 'notfound' | 'unauthenticated' | 'error'

/**
 * 空间旅行计划页（列表 + 详情共用一个**静态**入口）。
 *
 * 为什么是 query 参数而不是动态路由：移动端 Capacitor 壳是 `output: 'export'`
 * 静态站点，只为构建期可枚举的路径产出 HTML；`/space/plans/<id>` 这种数据驱动
 * 的路径在静态站里不存在。因此沿用 `/space/detail?slug=` 的既有做法：
 *   · 列表：`/space/plans?slug=<spaceSlug>`
 *   · 详情：`/space/plans?slug=<spaceSlug>&plan=<planId>`
 * Web 与 App 共用同一份实现，不会出现「网页有、App 没有」的漂移。
 *
 * 权限仍由服务端裁决：这里只根据 myRole 决定「是否显示创建/编辑入口」，
 * 越权调用会被 API 403。
 */
export default function SpacePlansPage() {
  const [slug, setSlug] = useState('')
  const [planId, setPlanId] = useState<number | null>(null)
  const [queryReady, setQueryReady] = useState(false)
  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<SpaceOverview | null>(null)
  const [message, setMessage] = useState('')

  // 静态导出下 window.location.search 是唯一数据来源；必须在客户端读
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSlug(params.get('slug') || '')
    const rawPlan = parseInt(params.get('plan') || '', 10)
    setPlanId(Number.isFinite(rawPlan) && rawPlan > 0 ? rawPlan : null)
    setQueryReady(true)
  }, [])

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
        const json = await res.json().catch(() => ({}))
        setMessage(json.error || '获取空间失败')
        setState('error')
        return
      }
      setData((await res.json()) as SpaceOverview)
      setState('ready')
    } catch {
      setMessage('网络错误，请重试')
      setState('error')
    }
  }, [slug])

  useEffect(() => {
    if (!queryReady) return
    void load()
  }, [queryReady, load])

  if (!queryReady) {
    return (
      <div className="m-gutter pt-2">
        <LargeTitle title="旅行计划" eyebrow="甜途 · 旅行计划" back="/space" />
        <LoaderBlock label="正在打开…" />
      </div>
    )
  }

  if (!slug) {
    return (
      <MessageState
        title="缺少空间信息"
        description="请从空间详情页进入旅行计划。"
        action={<Button href="/space">回空间列表</Button>}
      />
    )
  }

  if (state === 'loading') {
    return (
      <div className="m-gutter pt-2">
        <LargeTitle title="旅行计划" eyebrow="甜途 · 旅行计划" back={spaceDetailHref(slug)} />
        <LoaderBlock label="正在打开旅行计划…" />
      </div>
    )
  }

  if (state === 'unauthenticated') {
    return (
      <MessageState
        title="需要登录"
        description="旅行计划只对空间成员开放。"
        action={
          <Button
            href={`/login?redirect=${encodeURIComponent(`/space/plans?slug=${slug}`)}`}
          >
            去登录
          </Button>
        }
      />
    )
  }

  if (state === 'denied') {
    return (
      <MessageState
        title="你还不是这个空间的成员"
        description="用邀请码加入空间后就能一起规划旅行。"
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

  const space = data.space
  const canEdit = space.myRole === 'OWNER' || space.myRole === 'MEMBER'

  return (
    <SpaceThemeScope type={space.spaceType}>
      {planId != null ? (
        <SpacePlanDetail
          spaceId={space.id}
          spaceSlug={space.slug}
          planId={planId}
          canEdit={canEdit}
          members={data.members}
        />
      ) : (
        <div className="pb-24">
          <div className="m-gutter pt-2">
            <LargeTitle
              title="旅行计划"
              eyebrow="甜途 · 旅行计划"
              subtitle={`${space.name} · 一起规划下一次出发`}
              back={spaceDetailHref(space.slug)}
            />
          </div>
          <div className="m-gutter mt-4">
            <SpacePlanSection spaceId={space.id} spaceSlug={space.slug} canEdit={canEdit} />
          </div>
        </div>
      )}
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
        <span className="flex h-14 w-14 items-center justify-center rounded-[var(--m-radius-card)] bg-[var(--ui-social-surface2)] text-[var(--ui-social-faint)]">
          <Icon icon={ShieldAlert} size="lg" />
        </span>
        <p className="mt-3 max-w-[280px] text-[13px] leading-5 text-[var(--ui-social-muted)]">{description}</p>
        <div className="mt-5">{action}</div>
      </div>
    </div>
  )
}
