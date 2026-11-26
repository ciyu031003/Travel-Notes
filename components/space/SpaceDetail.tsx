'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Images,
  Sparkles,
  MapPin,
  Users,
  UserPlus,
  Settings2,
  LogOut,
  ChevronLeft,
} from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { ActionSheet } from '@/components/mobile/ActionSheet'
import { Field, FieldTextarea, FieldSelect } from '@/components/mobile/Field'
import { toast } from '@/lib/mobile/toast-store'
import { hapticLight } from '@/lib/mobile/haptics'
import { apiUrl } from '@/lib/api-base'
import { travelDetailHref } from '@/lib/routes'
import {
  SPACE_TYPES,
  spaceThemeOf,
  spaceTypeIconOf,
  spaceTypeLabelOf,
  spaceRoleLabelOf,
} from '@/lib/mobile/space-system'
import { travelTypeIconOf, travelTypeLabelOf } from '@/lib/mobile/icon-system'
import { SpaceAvatar, SpaceAvatarStack } from './SpaceAvatarStack'
import { SpaceActivityFeed } from './SpaceActivityFeed'
import { SpaceInvitePanel } from './SpaceInvitePanel'
import { SpaceMemberList } from './SpaceMemberList'
import { SpaceSection, SpaceSectionLink, SpaceEmpty } from './SpaceSection'
import { SpacePlanSection } from './plans/SpacePlanSection'
import { SpaceStatStrip } from './SpaceStatStrip'
import type { SpaceOverview } from '@/lib/modules/space/space-overview.types'

export type SpaceDetailData = SpaceOverview

/** 日期用「2026.3.12」而不是「2026/3/12」：点号更轻，不抢标题的注意力 */
function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

/**
 * 空间详情 —— 协作主场（S2 全面重构）。
 *
 * 布局节奏（移动端 390 优先，桌面 ≥1024 收成居中的 900px 单栏）：
 *   ① Hero       — 类型主题渐变 + 安全区让位 + 类型徽标 + 空间名 + 成员堆叠 + 邀请/设置
 *   ② 统计条     — 压在 Hero 圆角下沿的四格「一张纸」（旅程 / 相册 / 回忆 / 成员）
 *   ③ 一起记录的旅行 — 横向封面卡（点进旅行详情）
 *   ④ 一起经营的相册 — 封面网格（点进画册）
 *   ⑤ 最近的共同回忆 — 发丝线时间线（只留文字与谁/哪天）
 *   ⑥ 成员        — 头像砖，点开成员面板
 *   ⑦ 空间动态     — AuditLog 精简流（一起打磨内容的痕迹）
 *   末尾留了一个 TRAVEL_PLAN_SECTION_SLOT 注释位：旅行计划模块由 lead 在那里插入
 *
 * 安全区：Hero 用项目既有 `m-safe-top-16`（= max(env(safe-area-inset-top),
 * --m-status-bar-height) + 16px）。这是真机反馈的核心 bug —— 直接 pt-16 在刘海屏
 * 上会把返回键压在状态栏下面，所以顶部间距必须由 token 计算，不能写死。
 *
 * 权限（服务端仍各自校验，这里只做显隐体验，与重构前完全一致）：
 *   OWNER  → 邀请 + 设置 + 成员管理
 *   MEMBER → 可编辑内容（空态给「记录一次」出口），但不邀请/不改空间
 *   VIEWER → 全页只读
 */
export default function SpaceDetail({
  data,
  onChanged,
}: {
  data: SpaceDetailData
  /** 数据变更后的刷新回调：客户端壳重新取数（服务端渲染场景不传也不影响） */
  onChanged?: () => void
}) {
  const router = useRouter()
  const { space, stats } = data
  const [inviteOpen, setInviteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isOwner = space.myRole === 'OWNER'
  const canEdit = space.myRole === 'OWNER' || space.myRole === 'MEMBER'

  // 空间背景图：用户上传后立刻在 Hero 预览（本地状态兜一层，等 onChanged 重新取数）
  const [coverPreview, setCoverPreview] = useState<string | null>(space.coverUrl ?? null)
  const [coverBusy, setCoverBusy] = useState(false)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  const uploadCover = async (file: File | null) => {
    if (!file) return
    setCoverBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('cover', file)
      const res = await fetch(apiUrl('/api/spaces/' + space.id + '/cover'), {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '背景上传失败')
      setCoverPreview(json.coverUrl || null)
      toast.success('背景已更新')
      void hapticLight()
      if (onChanged) onChanged()
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '背景上传失败')
    } finally {
      setCoverBusy(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  const removeCover = async () => {
    setCoverBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/spaces/' + space.id + '/cover'), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('移除失败')
      setCoverPreview(null)
      toast.success('已恢复类型配色')
      if (onChanged) onChanged()
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '移除失败')
    } finally {
      setCoverBusy(false)
    }
  }

  // 空间设置（改名 / 改类型 / 改简介）
  const [editName, setEditName] = useState(space.name)
  const [editDesc, setEditDesc] = useState(space.description || '')
  const [editType, setEditType] = useState(space.spaceType)

  const saveSettings = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/spaces/${space.id}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc, spaceType: editType }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '保存失败')
      setSettingsOpen(false)
      // 客户端壳下 router.refresh() 无效（页面是客户端取数），走回调重新拉一次
      if (onChanged) onChanged()
      else router.refresh()
    } catch (e: any) {
      setError(e.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    try {
      const res = await fetch(apiUrl(`/api/spaces/${space.id}/leave`), {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('退出失败')
      toast.info('已退出空间')
      router.push('/space')
    } catch (e: any) {
      toast.error(e.message || '退出失败')
    }
  }

  const statItems = [
    { label: '旅行', value: stats.travelCount, icon: MapPin },
    { label: '相册', value: stats.albumCount, icon: Images },
    { label: '回忆', value: stats.memoryCount, icon: Sparkles },
    { label: '成员', value: space.memberCount, icon: Users },
  ]

  // ── 滚动折叠栏（iOS Large Title 心智，配色走空间 token）────────────
  // hero 滚出视口顶部时浮出：返回 + 空间名 + 设置；IO 哨兵，零 scroll 监听。
  const [barCollapsed, setBarCollapsed] = useState(false)
  const heroSentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = heroSentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => setBarCollapsed(!entry.isIntersecting),
      { rootMargin: '-1px 0px 0px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const openSettings = () => {
    setError('')
    setSettingsOpen(true)
  }
  const openMembers = () => {
    void hapticLight()
    setMembersOpen(true)
  }

  return (
    <div className="pb-28">
      {/* 哨兵：与 hero 同位置滚出视口顶部 → 折叠 */}
      <div ref={heroSentinelRef} aria-hidden="true" className="h-px w-full" />
      <div className={cn('m-space-collapser', barCollapsed && 'is-collapsed')} aria-hidden={!barCollapsed}>
        <Link
          href="/space"
          aria-label="返回空间列表"
          className="m-pressable flex h-10 w-10 items-center justify-center justify-self-center rounded-full text-[var(--ui-space-accent-text)]"
        >
          <Icon icon={ChevronLeft} size="md" />
        </Link>
        <span className="m-space-collapser-title truncate">{space.name}</span>
        {isOwner ? (
          <button
            type="button"
            onClick={openSettings}
            aria-label="空间设置"
            className="m-pressable flex h-10 w-10 items-center justify-center justify-self-center rounded-full text-[var(--ui-space-accent-text)]"
          >
            <Icon icon={Settings2} size="md" />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>

      <div className="mx-auto w-full max-w-[900px]">
        {/* ── ① Hero：类型主题渐变的唯一大面积用武之地；顶部必须让开系统状态栏 ── */}
        <header
          className={cn(
            'space-hero m-safe-top-16 relative overflow-hidden rounded-b-3xl px-5 pb-9 md:mt-8 md:rounded-3xl md:px-8',
            space.coverUrl && 'has-photo',
          )}
          style={space.coverUrl ? ({ '--space-photo': `url("${space.coverUrl}")` } as React.CSSProperties) : undefined}
        >
          {/* 克制的装饰：两圈发丝环 + 一枚柔光，只做景深，不承载信息 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full border border-[var(--ui-space-hairline)] opacity-50"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-4 h-24 w-24 rounded-full border border-[var(--ui-space-hairline)] opacity-40"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-[var(--ui-space-hero-b)] opacity-30 blur-2xl"
          />

          <div className="relative flex items-center justify-between">
            <Link
              href="/space"
              aria-label="返回空间列表"
              className="m-icon-btn m-pressable bg-[var(--ui-social-surface)]/60 text-[var(--ui-space-accent-text)] backdrop-blur"
            >
              <Icon icon={ChevronLeft} size="md" />
            </Link>
            {isOwner ? (
              <button
                type="button"
                onClick={openSettings}
                aria-label="空间设置"
                className="m-icon-btn m-pressable bg-[var(--ui-social-surface)]/60 text-[var(--ui-space-accent-text)] backdrop-blur"
              >
                <Icon icon={Settings2} size="md" />
              </button>
            ) : (
              <span aria-hidden="true" className="h-11 w-11" />
            )}
          </div>

          <div className="relative mt-7">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ui-space-hairline)] bg-[var(--ui-social-surface)]/55 px-2.5 py-1 text-[11px] font-semibold text-[var(--ui-space-accent-text)] backdrop-blur">
              <Icon icon={spaceTypeIconOf(space.spaceType)} size="sm" />
              {spaceTypeLabelOf(space.spaceType)}
            </span>
            <h1 className="mt-3 text-[24px] font-bold leading-8 tracking-[-0.01em] text-[var(--ui-space-accent-text)]">
              {space.name}
            </h1>
            {space.description && (
              <p className="mt-1.5 line-clamp-2 max-w-[36ch] text-[13px] leading-5 text-[var(--ui-space-accent-text)] opacity-80">
                {space.description}
              </p>
            )}
          </div>

          <div className="relative mt-6 flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <SpaceAvatarStack members={space.members || []} max={4} size="md" />
              <div className="min-w-0 text-[var(--ui-space-accent-text)]">
                <p className="truncate text-[13px] font-medium leading-4">{space.memberCount} 位成员</p>
                <p className="mt-0.5 truncate text-[11px] leading-4 opacity-75">
                  我是{spaceRoleLabelOf(space.myRole)}
                </p>
              </div>
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="m-pressable inline-flex h-9 flex-none items-center gap-1 rounded-full bg-[var(--ui-social-surface)]/65 px-3.5 text-[13px] font-semibold text-[var(--ui-space-accent-text)] backdrop-blur"
              >
                <Icon icon={UserPlus} size="sm" />
                邀请
              </button>
            )}
          </div>
        </header>

        <div className="px-5 md:px-8">
          {/* ── ② 统计条：全页唯一抬升的那层纸 ── */}
          <SpaceStatStrip items={statItems} className="relative z-10 -mt-5" />

          {/* ── ③ 一起记录的旅行：横向封面卡（无封面字段时用主题渐变做「票根」） ── */}
          <SpaceSection
            title="一起记录的旅行"
            action={data.travels.length > 0 ? <SpaceSectionLink href="/travel">全部</SpaceSectionLink> : undefined}
          >
            {data.travels.length === 0 ? (
              <SpaceEmpty
                icon={MapPin}
                text="还没有一起的旅行"
                cta={canEdit ? { href: '/travel/new', label: '记录一次' } : undefined}
              />
            ) : (
              <div className="-mx-5 flex snap-x snap-mandatory items-stretch gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden md:-mx-8 md:px-8">
                {data.travels.map((t) => (
                  <Link
                    key={t.id}
                    href={travelDetailHref(t.slug)}
                    className="m-card-pressable space-hero relative flex h-[142px] w-[158px] flex-none snap-start flex-col justify-between overflow-hidden rounded-2xl p-3 ring-1 ring-[var(--ui-space-hairline)]"
                  >
                    <span className="inline-flex w-fit max-w-full items-center gap-1 truncate rounded-full bg-[var(--ui-social-surface)]/55 px-2 py-0.5 text-[11px] font-medium text-[var(--ui-space-accent-text)] backdrop-blur">
                      <Icon icon={travelTypeIconOf(t.travelType)} size="sm" />
                      <span className="truncate">{travelTypeLabelOf(t.travelType)}</span>
                    </span>
                    <span className="block">
                      <span className="line-clamp-2 block text-[15px] font-semibold leading-5 text-[var(--ui-space-accent-text)]">
                        {t.title}
                      </span>
                      <span className="mt-1 block truncate text-[11px] leading-4 text-[var(--ui-space-accent-text)] opacity-75">
                        {t.startDate ? fmtDate(t.startDate) : '日期待定'}
                        {t.status === 'PLANNED' ? ' · 计划中' : ''}
                        {t.visibility === 'PRIVATE' ? ' · 仅自己' : ''}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </SpaceSection>

          {/* ── ④ 一起经营的相册：封面网格 ── */}
          <SpaceSection
            title="一起经营的相册"
            action={data.albums.length > 0 ? <SpaceSectionLink href="/album">全部</SpaceSectionLink> : undefined}
          >
            {data.albums.length === 0 ? (
              <SpaceEmpty
                icon={Images}
                text="还没有共享相册"
                cta={{ href: '/album', label: '去相册看看' }}
              />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {data.albums.slice(0, 6).map((a) => (
                  <Link
                    key={a.id}
                    href="/album"
                    className="m-card-pressable block overflow-hidden rounded-2xl bg-[var(--ui-social-surface)] ring-1 ring-[var(--ui-social-line)]"
                  >
                    {/* 占位图标常驻在最底层：封面缺失、加载失败、懒加载未完成时都不会留下一块空洞 */}
                    <span className="relative block aspect-square w-full overflow-hidden bg-[var(--ui-space-accent-soft)]">
                      <span className="absolute inset-0 flex items-center justify-center text-[var(--ui-space-accent-strong)] opacity-50">
                        <Icon icon={Images} size="md" />
                      </span>
                      {a.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.coverUrl}
                          alt={a.title}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => {
                            // 封面 404 / 解码失败：藏掉 img，露出底下的图标占位
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="flex items-baseline justify-between gap-1 px-2 py-1.5">
                      <span className="truncate text-[11px] font-medium text-[var(--ui-social-text)]">
                        {a.title}
                      </span>
                      <span className="flex-none text-[11px] tabular-nums text-[var(--ui-social-faint)]">
                        {a.mediaCount}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </SpaceSection>

          {/* ── ⑤ 最近的共同回忆：发丝线时间线（只留文字 + 谁/哪天） ── */}
          <SpaceSection title="最近的共同回忆">
            {data.memories.length === 0 ? (
              <SpaceEmpty
                icon={Sparkles}
                text="还没有共同回忆"
                cta={canEdit ? { href: '/travel', label: '从旅行开始' } : undefined}
              />
            ) : (
              <ol className="space-y-5">
                {data.memories.slice(0, 4).map((m, i) => (
                  <li key={m.id} className="relative pl-6">
                    <span
                      aria-hidden="true"
                      className="absolute left-[3px] top-[5px] h-[7px] w-[7px] rounded-full bg-[var(--ui-space-accent-strong)]"
                    />
                    {i < Math.min(data.memories.length, 4) - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-5 left-[6px] top-4 w-px bg-[var(--ui-space-hairline)]"
                      />
                    )}
                    <p className="line-clamp-2 text-[13px] leading-5 text-[var(--ui-social-text)]">
                      {m.content || '（没有文字）'}
                    </p>
                    <p className="mt-1 truncate text-[11px] leading-4 text-[var(--ui-social-faint)]">
                      {m.createdBy ? `${m.createdBy} · ` : ''}
                      {fmtDate(m.happenedAt) || '未记录日期'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SpaceSection>

          {/* ── ⑥ 成员：头像砖，点开成员面板（角色调整/移除在面板里） ── */}
          <SpaceSection
            title="成员"
            meta={data.members.length > 0 ? `${space.memberCount} 位` : undefined}
            action={
              <button
                type="button"
                onClick={openMembers}
                className="m-pressable flex-none text-[13px] font-medium text-[var(--ui-space-accent-strong)]"
              >
                管理
              </button>
            }
          >
            {data.members.length === 0 ? (
              <SpaceEmpty icon={Users} text="还没有成员" />
            ) : (
              <div className="-mx-5 flex items-stretch gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden md:-mx-8 md:px-8">
                {data.members.slice(0, 6).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-label={`${m.nickname || m.username}，${spaceRoleLabelOf(m.role)}`}
                    onClick={openMembers}
                    className="m-pressable flex w-[76px] flex-none flex-col items-center gap-1.5 rounded-2xl bg-[var(--ui-social-surface)] px-1.5 py-3 ring-1 ring-[var(--ui-social-line)]"
                  >
                    <SpaceAvatar member={m} size="lg" />
                    <span className="w-full truncate text-center text-[11px] font-medium leading-4 text-[var(--ui-social-text)]">
                      {m.nickname || m.username}
                    </span>
                    <span className="text-[11px] leading-4 text-[var(--ui-social-faint)]">
                      {spaceRoleLabelOf(m.role)}
                    </span>
                  </button>
                ))}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="m-pressable flex w-[76px] flex-none flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--ui-space-hairline)] py-3 text-[var(--ui-space-accent-strong)]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ui-space-accent-soft)]">
                      <Icon icon={UserPlus} size="md" />
                    </span>
                    <span className="text-[11px] font-medium leading-4">邀请</span>
                  </button>
                )}
              </div>
            )}
          </SpaceSection>

          {/* ── ⑦ 空间动态：AuditLog 精简流（谁在这儿动过什么） ── */}
          <SpaceSection title="空间动态">
            {data.activity.length === 0 ? (
              <SpaceEmpty icon={Sparkles} text="还没有动态" />
            ) : (
              <div className="rounded-2xl bg-[var(--ui-social-surface)] px-4 ring-1 ring-[var(--ui-social-line)]">
                <SpaceActivityFeed items={data.activity.slice(0, 6)} />
              </div>
            )}
          </SpaceSection>

          {/* ── ⑤ 旅行计划：多人一起规划下一次出发（发起 / 清单 / 一键转旅行记录） ── */}
          <SpacePlanSection spaceId={space.id} spaceSlug={space.slug} canEdit={canEdit} />

          {space.myRole !== 'OWNER' && (
            <button
              type="button"
              onClick={() => {
                void hapticLight()
                setLeaveOpen(true)
              }}
              className="m-pressable mt-8 flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-[13px] text-[var(--ui-social-faint)] transition-colors hover:text-[var(--danger-soft)]"
            >
              <Icon icon={LogOut} size="sm" />
              退出空间
            </button>
          )}

          {error && !settingsOpen && (
            <p className="mt-3 text-center text-[13px] text-[var(--danger-soft)]">{error}</p>
          )}
        </div>
      </div>

      {/* ── 邀请面板（仅 OWNER） ── */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="邀请伙伴">
        <SpaceInvitePanel spaceId={space.id} />
      </BottomSheet>

      {/* ── 成员面板：OWNER 可调角色/移除，其他人只读 ── */}
      <BottomSheet open={membersOpen} onClose={() => setMembersOpen(false)} title="成员与权限">
        <div className="space-y-3">
          <p className="text-[13px] leading-5 text-[var(--ui-social-muted)]">
            空间共 {space.memberCount} 位成员，一起记录的内容对所有人可见。
          </p>
          <SpaceMemberList
            spaceId={space.id}
            myRole={space.myRole}
            members={data.members}
            onChanged={() => (onChanged ? onChanged() : router.refresh())}
          />
        </div>
      </BottomSheet>

      {/* ── 空间设置（仅 OWNER） ── */}
      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="空间设置">
        <div className="space-y-4">
          {/* 背景图：用户上传的图片作为 Hero 与「我的」页空间图标 */}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-[var(--ui-social-text)]">背景图</p>
            <div className="space-photo-setting">
              <div
                className={cn('space-photo-preview', !coverPreview && 'space-hero')}
                style={coverPreview ? { backgroundImage: `url("${coverPreview}")` } : undefined}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[var(--ui-social-muted)]">
                  {coverPreview ? '已用你上传的图片作为背景' : '默认使用空间类型的渐变背景'}
                </p>
                <div className="space-photo-actions mt-2">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void uploadCover(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={coverBusy}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {coverPreview ? '更换图片' : '上传图片'}
                  </Button>
                  {coverPreview && (
                    <Button size="sm" variant="ghost" disabled={coverBusy} onClick={() => void removeCover()}>
                      移除
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Field
            label="空间名称"
            name="edit-space-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={200}
          />
          <FieldTextarea
            label="简介"
            name="edit-space-desc"
            rows={2}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            maxLength={500}
          />
          <FieldSelect
            label="空间类型"
            name="edit-space-type"
            hint="换类型会同时换掉这个空间的配色"
            value={editType}
            onChange={(e) => setEditType(e.target.value)}
          >
            {SPACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {spaceTypeLabelOf(t)}
              </option>
            ))}
          </FieldSelect>

          {editType !== space.spaceType && (
            <div className="rounded-2xl bg-[var(--ui-social-surface-50)] p-3">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-[var(--ui-social-muted)]">
                新配色预览
              </p>
              <div className="space-hero h-16 rounded-2xl" data-space={spaceThemeOf(editType)} />
            </div>
          )}

          {error && <p className="text-[13px] text-[var(--danger-soft)]">{error}</p>}

          <Button block size="lg" loading={busy} onClick={() => void saveSettings()}>
            保存
          </Button>
        </div>
      </BottomSheet>

      {/* 退出确认：iOS ActionSheet（破坏性项红色），替代 window.confirm 的浏览器弹窗 */}
      <ActionSheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={`退出「${space.name}」后将无法查看空间内的共享内容`}
        options={[
          {
            label: '退出空间',
            destructive: true,
            onClick: () => void leave(),
          },
        ]}
      />
    </div>
  )
}
