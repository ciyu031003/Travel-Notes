'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Images, Sparkles, MapPin, Camera, UserPlus, Settings2, LogOut, ChevronRight,
  ChevronLeft, CalendarDays, Plus,
} from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Field, FieldTextarea, FieldSelect } from '@/components/mobile/Field'
import { Pill } from '@/components/mobile/Pills'
import { apiUrl } from '@/lib/api-base'
import { SPACE_TYPES, spaceThemeOf, spaceTypeIconOf, spaceTypeLabelOf, spaceRoleLabelOf } from '@/lib/mobile/space-system'
import { travelTypeIconOf, travelTypeLabelOf } from '@/lib/mobile/icon-system'
import { SpaceAvatarStack } from './SpaceAvatarStack'
import { SpaceActivityFeed } from './SpaceActivityFeed'
import { SpaceInvitePanel } from './SpaceInvitePanel'
import { SpaceMemberList } from './SpaceMemberList'
import type { SpaceOverview } from '@/lib/modules/space/space-overview.types'

export type SpaceDetailData = SpaceOverview

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h2 className="text-[13px] font-semibold tracking-[0.08em] text-[var(--social-muted)]">{title}</h2>
      {action}
    </div>
  )
}

/**
 * 空间详情 —— 协作主场。
 *
 * 五段内容 + 一个成员区，全部按「能不能一起改」组织：
 *   ① 一起记录的旅行  ② 一起经营的相册  ③ 正在规划下一趟  ④ 最近的共同回忆  ⑤ 空间动态
 *
 * 权限：OWNER 看得到邀请与设置；MEMBER 只能编辑内容；VIEWER 全页只读
 * （服务端仍会各自校验，前端显隐只是体验）。
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isOwner = space.myRole === 'OWNER'
  const canEdit = space.myRole === 'OWNER' || space.myRole === 'MEMBER'

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
    if (!window.confirm('确定退出该空间吗？退出后将无法查看空间内共享内容')) return
    try {
      const res = await fetch(apiUrl(`/api/spaces/${space.id}/leave`), {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('退出失败')
      router.push('/space')
    } catch (e: any) {
      setError(e.message || '退出失败')
    }
  }

  const statItems: Array<[string, number, typeof Images]> = [
    ['旅行', stats.travelCount, MapPin],
    ['相册', stats.albumCount, Images],
    ['回忆', stats.memoryCount, Sparkles],
    ['照片', stats.mediaCount, Camera],
  ]

  return (
    <div className="pb-24">
      {/* ── 头图：空间主题渐变的唯一大面积用武之地（≤ 屏 35%） ── */}
      <div className="space-hero relative px-5 pb-5 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between">
          <Link
            href="/space"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--social-surface)]/60 text-[var(--space-accent-text)] backdrop-blur"
            aria-label="返回空间列表"
          >
            <Icon icon={ChevronLeft} size="md" />
          </Link>
          {isOwner && (
            <button
              type="button"
              onClick={() => { setError(''); setSettingsOpen(true) }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--social-surface)]/60 text-[var(--space-accent-text)] backdrop-blur"
              aria-label="空间设置"
            >
              <Icon icon={Settings2} size="md" />
            </button>
          )}
        </div>

        <div className="mt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)]/70 px-3 py-1 text-[11px] font-semibold text-[var(--space-accent-text)] backdrop-blur">
            <Icon icon={spaceTypeIconOf(space.spaceType)} size="sm" />
            {spaceTypeLabelOf(space.spaceType)}
            <span className="opacity-70">· 我是{spaceRoleLabelOf(space.myRole)}</span>
          </span>
          <h1 className="mt-2.5 text-[24px] font-bold leading-8 text-[var(--space-accent-text)]">
            {space.name}
          </h1>
          {space.description && (
            <p className="mt-1.5 max-w-md text-[13px] leading-5 text-[var(--space-accent-text)] opacity-85">
              {space.description}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <SpaceAvatarStack members={space.members || []} max={5} size="md" />
            <span className="text-[13px] text-[var(--space-accent-text)] opacity-85">
              {space.memberCount} 位成员
            </span>
            {isOwner && (
              <Button
                size="sm"
                variant="secondary"
                icon={UserPlus}
                className="ml-auto"
                onClick={() => setInviteOpen(true)}
              >
                邀请
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="m-gutter pt-4">
        {/* ── 统计四格 ── */}
        <div className="grid grid-cols-4 gap-1.5">
          {statItems.map(([label, value, icon]) => (
            <div
              key={label}
              className="rounded-[var(--m-radius-control)] bg-[var(--social-surface)] py-3 text-center ring-1 ring-[var(--social-line)]"
            >
              <Icon icon={icon} size="sm" className="mx-auto text-[var(--space-accent-strong)]" />
              <div className="mt-1 text-[18px] font-semibold leading-5 tabular-nums text-[var(--social-text)]">
                {value}
              </div>
              <div className="text-[11px] text-[var(--social-faint)]">{label}</div>
            </div>
          ))}
        </div>

        {/* ── ① 一起记录的旅行 ── */}
        <section className="mt-7">
          <SectionHeader
            title="一起记录的旅行"
            action={
              <Link href="/travel" className="inline-flex items-center gap-0.5 text-[13px] text-[var(--space-accent-strong)]">
                全部<Icon icon={ChevronRight} size="sm" />
              </Link>
            }
          />
          {data.travels.length === 0 ? (
            <div className="mt-3 rounded-[var(--m-radius-card)] bg-[var(--social-surface-50)] px-4 py-6 text-center ring-1 ring-[var(--social-line)]">
              <p className="text-[13px] text-[var(--social-muted)]">这个空间还没有旅行记录</p>
              {canEdit && (
                <Link href="/travel/new" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--space-accent-strong)]">
                  <Icon icon={Plus} size="sm" />
                  记录一次旅行
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {data.travels.map((t) => (
                <Link
                  key={t.id}
                  href={`/travel/${t.slug}`}
                  className="flex items-center gap-3 rounded-[var(--m-radius-card)] bg-[var(--social-surface)] p-3.5 ring-1 ring-[var(--social-line)] transition active:scale-[0.995]"
                >
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-[var(--space-accent-soft)] text-[var(--space-accent-strong)]">
                    <Icon icon={travelTypeIconOf(t.travelType)} size="md" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-[var(--social-text)]">{t.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--social-faint)]">
                      {t.startDate && (
                        <>
                          <Icon icon={CalendarDays} size="sm" />
                          {fmtDate(t.startDate)}
                        </>
                      )}
                      <span>{travelTypeLabelOf(t.travelType)}</span>
                      {t.visibility === 'PRIVATE' && <span>· 仅自己可见</span>}
                    </span>
                  </span>
                  <Icon icon={ChevronRight} size="sm" tone="faint" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── ② 一起经营的相册 ── */}
        <section className="mt-7">
          <SectionHeader
            title="一起经营的相册"
            action={
              <Link href="/album" className="inline-flex items-center gap-0.5 text-[13px] text-[var(--space-accent-strong)]">
                全部<Icon icon={ChevronRight} size="sm" />
              </Link>
            }
          />
          {data.albums.length === 0 ? (
            <div className="mt-3 rounded-[var(--m-radius-card)] bg-[var(--social-surface-50)] px-4 py-6 text-center ring-1 ring-[var(--social-line)]">
              <p className="text-[13px] text-[var(--social-muted)]">还没有共享相册</p>
              <p className="mt-1 text-[11px] text-[var(--social-faint)]">
                照片会随「旅程回忆」一起进到这个空间
              </p>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {data.albums.map((a) => (
                <Link
                  key={a.id}
                  href="/album"
                  className="overflow-hidden rounded-[var(--m-radius-control)] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]"
                >
                  <span className="block aspect-square w-full bg-[var(--space-accent-soft)]">
                    {a.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.coverUrl} alt={a.title} className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="block truncate px-2 py-1.5 text-[11px] text-[var(--social-text)]">
                    {a.title}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── ③ 正在规划下一趟 ── */}
        {data.upcoming.length > 0 && (
          <section className="mt-7">
            <SectionHeader title="正在规划" />
            <div className="mt-3 space-y-2">
              {data.upcoming.map((t) => (
                <Link
                  key={t.id}
                  href={`/travel/${t.slug}`}
                  className="flex items-center gap-3 rounded-[var(--m-radius-card)] bg-[var(--space-accent-soft)] p-3.5"
                >
                  <Icon icon={MapPin} size="md" className="text-[var(--space-accent-strong)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-[var(--space-accent-text)]">
                      {t.title}
                    </span>
                    <span className="text-[11px] text-[var(--space-accent-text)] opacity-80">
                      {t.startDate ? `${fmtDate(t.startDate)} 出发` : '还没定日期'}
                    </span>
                  </span>
                  <Pill tone="neutral" size="sm">计划中</Pill>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── ④ 最近的共同回忆 ── */}
        {data.memories.length > 0 && (
          <section className="mt-7">
            <SectionHeader title="最近的共同回忆" />
            <div className="mt-3 space-y-1.5">
              {data.memories.map((m) => (
                <div
                  key={m.id}
                  className="rounded-[var(--m-radius-control)] bg-[var(--social-surface)] px-3.5 py-3 ring-1 ring-[var(--social-line)]"
                >
                  <p className="line-clamp-2 text-[13px] leading-5 text-[var(--social-text)]">
                    {m.content || '（无文字）'}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--social-faint)]">
                    {m.createdBy ? `${m.createdBy} · ` : ''}
                    {fmtDate(m.happenedAt)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── ⑤ 空间动态（读 AuditLog，零改库） ── */}
        <section className="mt-7">
          <SectionHeader title="空间动态" />
          {data.activity.length === 0 ? (
            <p className="mt-3 rounded-[var(--m-radius-card)] bg-[var(--social-surface-50)] px-4 py-6 text-center text-[13px] text-[var(--social-muted)] ring-1 ring-[var(--social-line)]">
              还没有动态。有人创建内容或调整成员后，这里会留下痕迹。
            </p>
          ) : (
            <div className="mt-1 rounded-[var(--m-radius-card)] bg-[var(--social-surface)] px-3.5 py-1 ring-1 ring-[var(--social-line)]">
              <SpaceActivityFeed items={data.activity} />
            </div>
          )}
        </section>

        {/* ── 成员与邀请 ── */}
        <section className="mt-7">
          <SectionHeader
            title={`成员（${space.memberCount}）`}
            action={
              isOwner ? (
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex items-center gap-0.5 text-[13px] text-[var(--space-accent-strong)]"
                >
                  管理<Icon icon={ChevronRight} size="sm" />
                </button>
              ) : undefined
            }
          />
          <div className="mt-3">
            <SpaceMemberList
              spaceId={space.id}
              myRole={space.myRole}
              members={data.members}
              onChanged={() => (onChanged ? onChanged() : router.refresh())}
            />
          </div>
        </section>

        {space.myRole !== 'OWNER' && (
          <button
            type="button"
            onClick={() => void leave()}
            className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-[13px] text-[var(--social-faint)] transition hover:text-[var(--danger-soft)]"
          >
            <Icon icon={LogOut} size="sm" />
            退出空间
          </button>
        )}

        {error && !settingsOpen && (
          <p className="mt-3 text-center text-[13px] text-[var(--danger-soft)]">{error}</p>
        )}
      </div>

      {/* ── 邀请面板 ── */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="邀请伙伴">
        <SpaceInvitePanel spaceId={space.id} />
      </BottomSheet>

      {/* ── 空间设置（仅 OWNER） ── */}
      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="空间设置">
        <div className="space-y-4">
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
            <div className="rounded-[var(--m-radius-control)] bg-[var(--social-surface2)] p-3">
              <p className="mb-2 text-[13px] text-[var(--social-muted)]">预览新配色</p>
              <div className="space-hero h-14 rounded-[12px]" data-space={spaceThemeOf(editType)} />
            </div>
          )}

          {error && <p className="text-[13px] text-[var(--danger-soft)]">{error}</p>}

          <Button block size="lg" loading={busy} onClick={() => void saveSettings()}>
            保存
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
