'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert, ChevronLeft } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { apiUrl } from '@/lib/api-base'
import { spaceDetailHref } from '@/lib/routes'
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
 *
 * S2：loading 改成与详情页同构的骨架（Hero 渐变块 + 统计条 + 横向卡），
 * 避免「先白屏 → 再整页跳一下」；四个失败态统一成一张克制的说明卡。
 */
export default function SpaceDetailClient({ slugProp }: { slugProp?: string }) {
  const params = useParams<{ slug: string }>()
  // 移动端壳走 /space/detail?slug=（slugProp 由页面从 query 读出）；Web 走 /space/[slug]
  const slug = slugProp
    ? decodeURIComponent(slugProp)
    : typeof params?.slug === 'string'
      ? decodeURIComponent(params.slug)
      : ''

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
    return <SpaceDetailSkeleton />
  }

  if (state === 'unauthenticated') {
    return (
      <MessageState
        title="需要登录"
        description="空间内容只对登录用户开放。"
        action={<Button href={`/login?redirect=${encodeURIComponent(spaceDetailHref(slug))}`}>去登录</Button>}
      />
    )
  }

  if (state === 'denied') {
    return (
      <MessageState
        title="你还不是这个空间的成员"
        description="用邀请码加入后就能看到内容。"
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
      {/* 左缘右滑返回由全局壳（LayoutContent）提供，页面不再重复挂载（一滑退两层 bug） */}
      <SpaceDetail data={data} onChanged={() => void load()} />
    </SpaceThemeScope>
  )
}

/**
 * 加载骨架：与真实详情同构（Hero 渐变 + 压在圆角上的统计条 + 横向封面卡），
 * 只让内容区「抖」而不是整页重排。骨架自身不做无限动画以外的装饰。
 */
function SpaceDetailSkeleton() {
  return (
    <div className="pb-28">
      <div className="mx-auto w-full max-w-[900px]">
        <div className="space-hero m-safe-top-16 rounded-b-3xl px-5 pb-9 md:mt-8 md:rounded-3xl md:px-8">
          <div className="flex items-center justify-between">
            <Link
              href="/space"
              aria-label="返回空间列表"
              className="m-icon-btn m-pressable bg-[var(--ui-social-surface)]/60 text-[var(--ui-space-accent-text)] backdrop-blur"
            >
              <Icon icon={ChevronLeft} size="md" />
            </Link>
            <span aria-hidden="true" className="h-11 w-11" />
          </div>
          <div className="mt-7 space-y-3">
            <span className="m-skeleton block h-6 w-20 rounded-full" />
            <span className="m-skeleton block h-7 w-40" />
            <span className="m-skeleton block h-4 w-56" />
          </div>
          <div className="mt-6 flex items-center gap-2.5">
            <span className="m-skeleton block h-8 w-8 rounded-full" />
            <span className="m-skeleton block h-4 w-24" />
          </div>
        </div>

        <div className="px-5 md:px-8">
          <div className="m-skeleton relative z-10 -mt-5 h-[72px] rounded-[var(--m-radius-card)]" />
          <div className="mt-8 space-y-3">
            <span className="m-skeleton block h-4 w-28" />
            <div className="-mx-5 flex gap-2.5 overflow-hidden px-5 md:-mx-8 md:px-8">
              {[0, 1, 2].map((i) => (
                <span key={i} className="m-skeleton block h-[142px] w-[158px] flex-none rounded-2xl" />
              ))}
            </div>
          </div>
          <div className="mt-8 space-y-3">
            <span className="m-skeleton block h-4 w-24" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className="m-skeleton block aspect-square rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 失败/拦截态：居中一张说明卡，返回入口固定在左上角（安全区内） */
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
    <div className="mx-auto w-full max-w-[900px] px-5 pb-28 md:px-8">
      <div className="m-safe-top-16 flex items-center">
        <Link
          href="/space"
          aria-label="返回空间列表"
          className="m-icon-btn m-pressable bg-[var(--ui-social-surface-50)] text-[var(--ui-social-text)]"
        >
          <Icon icon={ChevronLeft} size="md" />
        </Link>
      </div>
      <div className="mt-14 flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ui-social-surface2)] text-[var(--ui-social-faint)]">
          <Icon icon={ShieldAlert} size="lg" />
        </span>
        <h1 className="mt-4 text-[18px] font-semibold leading-6 text-[var(--ui-social-text)]">{title}</h1>
        <p className="mt-1.5 max-w-[280px] text-[13px] leading-5 text-[var(--ui-social-muted)]">{description}</p>
        <div className="mt-6">{action}</div>
      </div>
    </div>
  )
}
