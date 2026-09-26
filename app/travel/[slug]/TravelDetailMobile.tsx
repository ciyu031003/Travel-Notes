'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  CloudOff,
  Images,
  LayoutGrid,
  MoreHorizontal,
  PenLine,
  Pencil,
  RefreshCw,
  User,
  Users,
  Wallet,
  Maximize2,
} from 'lucide-react'
import { ActionSheet } from '@/components/mobile/ActionSheet'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Button } from '@/components/mobile/Button'
import { Icon } from '@/components/mobile/Icon'
import { IconButton } from '@/components/mobile/IconButton'
import { Loader } from '@/components/mobile/Loader'
import { SegmentedControl } from '@/components/mobile/SegmentedControl'
import { TravelTypePill } from '@/components/mobile/Pills'
import MemoryComposer from '@/components/travel/MemoryComposer'
import TravelItineraryTab from '@/components/travel/detail/TravelItineraryTab'
import TravelAlbumTab from '@/components/travel/detail/TravelAlbumTab'
import TravelExpenseTab from '@/components/travel/detail/TravelExpenseTab'
import TravelOverviewTab from '@/components/travel/detail/TravelOverviewTab'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { travelDetailHref } from '@/lib/routes'
import { hapticLight } from '@/lib/mobile/haptics'
import TravelPhotoViewer, { type ViewerPhoto } from './TravelPhotoViewer'
import { compactRange, dayFullLabel, mediaKeyOf, rangeDays } from '@/components/travel/detail/format'
import type { ExpenseItem, TimelineDay, TravelInfoForDetail, ViewerPhotoLike } from '@/components/travel/detail/types'

type TabKey = 'overview' | 'itinerary' | 'album' | 'expense'

/**
 * 旅行详情 · 移动端信息架构（本次重构的主体）。
 *
 * 目标：把「一个吞掉整页的全屏相册」换成**可规划、可上传、可修改**的目的地。
 * 结构对齐参考产品：顶部日期摘要 → 分段 tab（总览 / 行程 / 相册 / 花销）→ 底部主操作。
 *
 * 桌面端继续走原来的文章式排版（\`TravelDetailShell\` 里 \`hidden md:block\` 那一支），
 * 两边互不影响，降低回归风险。
 */
export default function TravelDetailMobile({
  slug,
  travel,
  images,
  pendingSync,
  onEdit,
  onBack,
  onEditReload,
  onSyncNow,
  dataVersion = 0,
}: {
  slug: string
  travel: TravelInfoForDetail
  images: string[]
  /** 本地兜底渲染（还没同步上云）时为 true：写操作一律禁用并说明原因 */
  pendingSync: boolean
  onEdit: () => void
  onBack: () => void
  /** 旅行级字段（封面/预算）变了：让外壳重新拉一次详情 */
  onEditReload: () => void
  /** 「立即同步」：手动触发一轮上传，成功后外壳会重载详情（待同步态 → 可编辑） */
  onSyncNow?: () => Promise<void> | void
  /**
   * 外壳的详情重载版本号。编辑信息（尤其是日期区间）后，服务端会补齐/调整「天」，
   * 本地这份 timeline 必须跟着重取 —— 否则头部已经显示「共 5 天」，
   * 行程页签里还停在旧的 3 天（真实回归，E2E travel-edit.spec.ts 抓到过）。
   */
  dataVersion?: number
}) {
  const router = useRouter()
  const travelId = travel.id
  const serverKnown = travelId > 0 && !pendingSync
  const [syncing, setSyncing] = useState(false)
  // 归属空间选择器（仅旅行创建者可见）：把自己的旅行放进某个空间，或收回为「仅自己」
  const [spacePickerOpen, setSpacePickerOpen] = useState(false)
  const [mySpaces, setMySpaces] = useState<Array<{ id: number; name: string; spaceType: string; myRole: string }>>([])
  const [spacesLoading, setSpacesLoading] = useState(false)
  const [movingSpace, setMovingSpace] = useState(false)

  const openSpacePicker = useCallback(async () => {
    setSpacePickerOpen(true)
    if (mySpaces.length > 0) return
    setSpacesLoading(true)
    try {
      const res = await fetch(apiUrl('/api/spaces'), { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) setMySpaces(j.spaces || [])
    } catch {
      // 静默：选择器里显示空态即可
    } finally {
      setSpacesLoading(false)
    }
  }, [mySpaces.length])

  const moveToSpace = useCallback(
    async (spaceId: number | null) => {
      if (!travelId) return
      setMovingSpace(true)
      try {
        const res = await fetch(apiUrl(`/api/travels/${travelId}/space`), {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spaceId }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || '操作失败')
        setSpacePickerOpen(false)
        toast.success(spaceId ? '已移入空间，成员都能看到并一起编辑' : '已收回为仅自己可见')
        onEditReload()
      } catch (e: any) {
        toast.error(e.message || '操作失败')
      } finally {
        setMovingSpace(false)
      }
    },
    [travelId, onEditReload],
  )

  /**
   * 可见性切换（「公开」按钮）。
   * 与「放不放进空间」正交：公开 = 旅行圈所有登录用户可见；空间可见 = 仅该空间成员。
   * 服务端 `updateTravel` 会同时写 visibility 与 isPublic，避免两个字段各说各话。
   */
  const setVisibility = useCallback(
    async (next: 'PRIVATE' | 'SPACE' | 'PUBLIC') => {
      if (!travelId) return
      try {
        const res = await fetch(apiUrl(`/api/admin/travels/${travelId}`), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility: next }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || '设置失败')
        toast.success(
          next === 'PUBLIC' ? '已公开，所有登录用户都能看到' : next === 'SPACE' ? '空间成员可见' : '已设为仅自己可见',
        )
        onEditReload()
      } catch (e: any) {
        toast.error(e.message || '设置失败')
      }
    },
    [travelId, onEditReload],
  )

  const syncNow = useCallback(async () => {
    if (!onSyncNow) return
    setSyncing(true)
    try {
      await onSyncNow()
    } finally {
      setSyncing(false)
    }
  }, [onSyncNow])

  const [tab, setTab] = useState<TabKey>('overview')

  /**
   * 首页「进行中的旅行」卡片用 #album / #itinerary / #expense 直达对应页签
   * （比 query 参数稳：静态导出下 hash 不参与路由匹配）。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash.replace('#', '')
    if (hash === 'overview' || hash === 'itinerary' || hash === 'album' || hash === 'expense') {
      setTab(hash)
    }
  }, [])
  const [days, setDays] = useState<TimelineDay[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [expenses, setExpenses] = useState<{ expenses: ExpenseItem[]; total: number; budget: number | null } | null>(null)
  const [expenseLoading, setExpenseLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; index: number } | null>(null)
  const [composing, setComposing] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  /* ---------------- 按天时间线（行程 / 相册 / 总览共用） ---------------- */
  useEffect(() => {
    if (travelId <= 0) {
      setTimelineLoading(false)
      return
    }
    let alive = true
    setTimelineLoading(true)
    fetch(apiUrl(`/api/travels/${travelId}/timeline`), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        setDays(Array.isArray(j?.timeline?.days) ? j.timeline.days : [])
      })
      .catch(() => {
        if (alive) setDays([])
      })
      .finally(() => {
        if (alive) setTimelineLoading(false)
      })
    return () => {
      alive = false
    }
  }, [travelId, reloadKey, dataVersion])

  /* ---------------- 花销 ---------------- */
  useEffect(() => {
    if (travelId <= 0) {
      setExpenseLoading(false)
      return
    }
    let alive = true
    setExpenseLoading(true)
    fetch(apiUrl(`/api/travels/${travelId}/expenses`), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        setExpenses({
          expenses: Array.isArray(j?.expenses) ? j.expenses : [],
          total: Number(j?.total) || 0,
          budget: j?.budget == null ? null : Number(j.budget),
        })
      })
      .catch(() => {
        if (alive) setExpenses({ expenses: [], total: 0, budget: travel.budget ?? null })
      })
      .finally(() => {
        if (alive) setExpenseLoading(false)
      })
    return () => {
      alive = false
    }
  }, [travelId, reloadKey, dataVersion, travel.budget])

  /** 旅行级图片中排除已被「天」覆盖的（按媒体 key 比对 URL 变体差异） */
  const restImages = useMemo(
    () => images.filter((u) => !new Set(days.flatMap((d) => d.photos.map((p) => mediaKeyOf(p.url)))).has(mediaKeyOf(u))),
    [images, days],
  )

  /**
   * 所有照片（按天聚合 + 旅行级图片），用于总览横滑与沉浸视图。
   * 去重用 mediaKeyOf（同一张照片的 thumbnail / preview 是两个 URL），
   * 否则总览里会看到重复的两张图。
   */
  const allPhotos = useMemo<ViewerPhotoLike[]>(() => {
    const seen = new Set<string>()
    const out: ViewerPhotoLike[] = []
    for (const d of days) {
      for (const p of d.photos) {
        const key = mediaKeyOf(p.url)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ id: p.id, url: p.url })
      }
    }
    for (const url of restImages) {
      const key = mediaKeyOf(url)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ url })
    }
    return out
  }, [days, restImages])

  const heroCover = travel.coverUrl || travel.cover || allPhotos[0]?.url || null
  const daysCount = rangeDays(travel.startDate, travel.endDate)
  const rangeText = compactRange(travel.startDate, travel.endDate)

  /** 「记一笔」默认落到哪一天：优先今天，否则最后一天（最近的） */
  const defaultDay = useMemo(() => {
    if (days.length === 0) return null
    const today = new Date().toDateString()
    const hit = days.find((d) => d.date && new Date(d.date).toDateString() === today)
    const chosen = hit ?? days[days.length - 1]
    const idx = days.findIndex((d) => d.id === chosen.id)
    return { id: chosen.id, label: dayFullLabel(chosen.date, idx), date: chosen.date }
  }, [days])

  const companions = Array.isArray(travel.companions) ? (travel.companions as { name?: string; relation?: string }[]) : []

  const canWrite = serverKnown

  /** 把某张照片设为封面（沉浸视图右上角触发） */
  const setCover = async (photo: ViewerPhotoLike) => {
    if (photo.id == null) return
    try {
      const res = await fetch(apiUrl('/api/travels/by-slug/' + encodeURIComponent(travel.slug || slug)), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverMediaId: photo.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '设置失败')
      toast.success('已设为封面')
      onEditReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '设置失败')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--m-bg)] pb-[calc(160px+env(safe-area-inset-bottom))] text-[var(--m-text)]">
      {/* 顶栏：返回 + 标题省略 + ⋯（编辑信息 / 删除 / 分享） */}
      <header
        className="m-glass sticky top-0 z-40 flex items-center gap-1 px-2"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <IconButton icon={ChevronLeft} label="返回旅行记录" variant="plain" onClick={onBack} />
        <span className="m-body min-w-0 flex-1 truncate text-center font-medium">{travel.title}</span>
        {/*
          编辑入口重新设计：从"藏在 ⋯ 菜单里"改成顶栏上一个**可见的「编辑」**。
          真机反馈的"新建完以后能在哪个地方进一步修改，入口也没显示出来"就是这里。
        */}
        {travel.canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="m-pressable flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[14px] font-medium text-[var(--m-accent-strong)]"
          >
            <Icon icon={Pencil} size="sm" />
            编辑
          </button>
        )}
        <IconButton icon={MoreHorizontal} label="更多操作" variant="plain" onClick={() => setMoreOpen(true)} />
      </header>

      {/*
        Hero：封面 + 标题 + 日期区间 + 共 N 天 M 晚。
        ⚠️ 标题**必须放在封面容器内部**（或干脆不带封面）。此前的写法是
        「封面 div 用 relative + 标题用 -mt-6 压在封面上」—— 定位元素会盖住
        未定位的普通流内容，结果标题被封面整块遮住（截图实测）。
        另外封面图一律 alt=""：它是装饰性的（标题就在旁边），
        图片 404 时也不会把长标题当 alt 文本渲染出来。
      */}
      <section>
        {heroCover ? (
          /*
            打开旅行先看到的是"图片 + 下面的评价与规划"，**不是一上来就整屏滑动图片**。
            想沉浸看图的用户点这里（或右上角「全屏查看」）进二级查看器，可上下滑动。
          */
          <button
            type="button"
            aria-label="全屏查看旅行照片"
            onClick={() => setViewer({ photos: allPhotos as ViewerPhoto[], index: 0 })}
            className="relative block h-48 w-full overflow-hidden bg-[var(--m-bg-soft)] text-left"
          >
            <Image src={heroCover} alt="" fill sizes="100vw" className="object-cover" priority />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(26,16,9,0.72),rgba(26,16,9,0)_62%)]" />
            {/* 右上角：全屏查看（图片上一个明确的按钮，符合真机要求） */}
            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-md">
              <Icon icon={Maximize2} size="sm" />
              全屏查看
            </span>
            {allPhotos.length > 0 && (
              <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white backdrop-blur-md">
                {allPhotos.length} 张
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 block px-4 pb-2.5">
              <h1 className="text-[24px] font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)]">
                {travel.title}
              </h1>
            </span>
          </button>
        ) : (
          <div className="px-4 pt-1">
            <h1 className="text-[24px] font-bold leading-tight text-[var(--m-text)]">{travel.title}</h1>
          </div>
        )}
        <div className="px-4 pt-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--m-muted)]">
            {rangeText && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon icon={CalendarDays} size="sm" />
                {rangeText}
              </span>
            )}
            {daysCount != null && <span>共 {daysCount} 天 {Math.max(0, daysCount - 1)} 晚</span>}
            {travel.location && <span>{travel.location}</span>}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {travel.travelType && <TravelTypePill type={travel.travelType} size="sm" />}
            {companions.map((c, i) => (
              <span key={`${c?.name ?? 'c'}-${i}`} className="m-chip !h-6 !text-[11px]">
                {String(c?.name || '').trim()}
              </span>
            ))}
            {/*
              可见的「编辑信息」入口：真机反馈「新建完以后能在哪个地方进一步修改，
              这个入口也没有显示出来」。虽然 ⋯ 菜单里也有，但把它藏进二级菜单
              正是这条反馈的来源 —— 所以在标题下方直接给一个。
            */}
            {travel.canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[var(--m-line)] px-3 text-[12px] font-medium text-[var(--m-muted)] active:scale-95"
              >
                <Icon icon={Pencil} size="sm" />
                编辑信息
              </button>
            )}
          </div>

          {/*
            「这本旅行属于谁」必须一眼可见 —— 真机反馈「点开情侣空间/家人空间后
            怎么和自己的做区分」。这里显式标注：仅自己 / 某个空间（+ 我在该空间的角色）。
          */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void openSpacePicker()}
              className={
                travel.canMoveSpace
                  ? 'inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-[var(--m-surface-2)] px-3 text-[12px] font-medium text-[var(--m-text)] active:scale-95'
                  : 'inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-[var(--m-surface-2)] px-3 text-[12px] font-medium text-[var(--m-muted)]'
              }
            >
              <Icon icon={travel.spaceId ? Users : User} size="sm" />
              {travel.spaceId ? travel.spaceName || '共享空间' : '仅自己'}
              {travel.mySpaceRole && (
                <span className="text-[var(--m-faint)]">
                  · {travel.mySpaceRole === 'OWNER' ? '主人' : travel.mySpaceRole === 'MEMBER' ? '成员' : '只读'}
                </span>
              )}
              {travel.canMoveSpace && <Icon icon={ChevronDown} size="sm" />}
            </button>
            {travel.spaceId && !travel.canEdit && (
              <span className="text-[12px] text-[var(--m-muted)]">你在该空间是只读成员，只能查看</span>
            )}
          </div>
        </div>
      </section>

      {pendingSync && (
        <div className="mx-4 mt-3 rounded-2xl bg-[var(--m-accent-soft)] px-3.5 py-3 text-[12px] text-[var(--m-accent-strong)]">
          <div className="flex items-start gap-2">
            <Icon icon={CloudOff} size="sm" className="mt-0.5 shrink-0" />
            <span>
              这本旅行还在本地待同步，所以暂时不能添加行程、照片与花销。
              联网后会自动上传；也可点右侧按钮立即重试。
            </span>
          </div>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            className="m-pressable mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--m-accent-strong)] px-3 py-1.5 text-[12px] font-medium text-[var(--m-on-accent)] disabled:opacity-60"
          >
            <Icon icon={RefreshCw} size="sm" />
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>
      )}

      {/* 分段 tab */}
      <div className="px-4 pt-4">
        <SegmentedControl<TabKey>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: '总览', icon: LayoutGrid },
            { value: 'itinerary', label: '行程', icon: CalendarDays },
            { value: 'album', label: '相册', icon: Images },
            { value: 'expense', label: '花销', icon: Wallet },
          ]}
        />
      </div>

      <main className="px-4 pt-4">
        {tab === 'overview' && (
          timelineLoading ? (
            <div className="flex justify-center py-16"><Loader /></div>
          ) : (
            <TravelOverviewTab
              travel={travel}
              days={days}
              expenseState={expenses}
              photos={allPhotos}
              onOpenViewer={(photos, index) => setViewer({ photos: photos as ViewerPhoto[], index })}
              onGoTab={setTab}
            />
          )
        )}

        {tab === 'itinerary' && (
          canWrite ? (
            <TravelItineraryTab travelId={travelId} days={days} loading={timelineLoading} onChanged={reload} />
          ) : (
            <DisabledHint />
          )
        )}

        {tab === 'album' && (
          canWrite ? (
            <TravelAlbumTab
              travelId={travelId}
              days={days}
              loading={timelineLoading}
              coverMediaId={travel.coverMediaId ?? null}
              extraImages={restImages}
              onChanged={reload}
              onOpenViewer={(photos, index) => setViewer({ photos: photos as ViewerPhoto[], index })}
            />
          ) : (
            <DisabledHint />
          )
        )}

        {tab === 'expense' && (
          canWrite ? (
            <TravelExpenseTab
              travelId={travelId}
              slug={slug}
              days={days}
              loading={expenseLoading}
              state={expenses}
              onChanged={reload}
            />
          ) : (
            <DisabledHint />
          )
        )}
      </main>

      {/*
        底部主操作：记录一笔（写文字 + 传照片一步完成）。
        ⚠️ 必须抬到底部导航条**之上**：LayoutContent 对 /travel* 会挂 MobileBottomNav
        （fixed bottom-0 z-40，高约 64px）。此前写成 bottom-0 z-30，会被导航条整块盖住，
        表现就是"详情页底部那个按钮点不到"。
      */}
      <div
        className="fixed inset-x-0 z-30 px-4 pb-3 pt-3"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, var(--m-bg) 72%, transparent)',
        }}
      >
        <Button
          block
          size="lg"
          icon={PenLine}
          disabled={!canWrite}
          onClick={() => {
            void hapticLight()
            setComposing(true)
          }}
        >
          {canWrite ? '记录一笔' : '待同步后可记录'}
        </Button>
      </div>

      {/* 沉浸相册（二级视图，带关闭按钮；不再吞掉详情页） */}
      <TravelPhotoViewer
        open={Boolean(viewer)}
        photos={viewer?.photos ?? []}
        startIndex={viewer?.index ?? 0}
        title={travel.title}
        location={travel.location ?? undefined}
        date={travel.startDate ?? undefined}
        onClose={() => setViewer(null)}
        onSetCover={canWrite ? setCover : undefined}
      />

      {/* 记一笔 */}
      {composing && canWrite && (
        <MemoryComposer
          travelId={travelId}
          dayId={defaultDay?.id ?? null}
          dayLabel={defaultDay?.label ?? '第一天'}
          dayDate={defaultDay?.date ?? null}
          onClose={() => setComposing(false)}
          onDone={reload}
        />
      )}

      <ActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={travel.title}
        options={[
          {
            label: '编辑旅行信息',
            onClick: () => {
              if (!travel.canEdit) {
                toast.error('这本旅行不在你名下，无法编辑')
                return
              }
              onEdit()
            },
          },
          // 归属空间：把自己的旅行放进情侣/家庭/朋友空间，或收回为「仅自己」
          ...(travel.canMoveSpace
            ? [
                {
                  label: travel.spaceId ? '更改所属空间' : '放到共享空间',
                  onClick: () => void openSpacePicker(),
                },
              ]
            : []),
          // 可见性（「公开」按钮）：在空间里时中间态是「空间成员可见」
          ...(travel.canEdit
            ? [
                travel.visibility === 'PUBLIC'
                  ? { label: '取消公开（不再所有人可见）', onClick: () => void setVisibility(travel.spaceId ? 'SPACE' : 'PRIVATE') }
                  : { label: '设为公开（所有登录用户可见）', onClick: () => void setVisibility('PUBLIC') },
              ]
            : []),
          {
            label: '复制分享链接',
            onClick: async () => {
              try {
                const url = `${window.location.origin}${travelDetailHref(travel.slug || slug)}`
                await navigator.clipboard.writeText(url)
                toast.success('链接已复制')
              } catch {
                toast.error('复制失败')
              }
            },
          },
          {
            label: '删除这本旅行',
            destructive: true,
            onClick: async () => {
              if (!travel.canEdit) {
                toast.error('这本旅行不在你名下，无法删除')
                return
              }
              if (!window.confirm('删除后旅行及其回忆、照片会一起消失，确定？')) return
              const res = await fetch(apiUrl(`/api/travels/${travelId}`), {
                method: 'DELETE',
                credentials: 'include',
              }).catch(() => null)
              if (res && res.ok) {
                toast.success('已删除')
                router.replace('/travel')
              } else {
                toast.error('删除失败')
              }
            },
          },
        ]}
      />

      {/*
        归属空间选择器。
        产品诉求：「怎么把我原先建立的行程放到情侣空间，让空间主人/成员一起阅览、修改」。
        这里列出「仅自己」+ 我有写权限的空间，选一个即可移入/移出。
        移入后空间成员可见并可编辑；只读（VIEWER）的空间不会出现在列表里（服务端也会拒）。
      */}
      <BottomSheet open={spacePickerOpen} onClose={() => setSpacePickerOpen(false)} title="放到哪里？">
        <div className="space-y-2">
          <button
            type="button"
            disabled={movingSpace}
            onClick={() => void moveToSpace(null)}
            className={
              'flex w-full items-center gap-3 rounded-[var(--m-radius-control)] px-3.5 py-3 text-left disabled:opacity-60 ' +
              (!travel.spaceId ? 'bg-[var(--m-accent-soft)]' : 'bg-[var(--m-surface-2)]')
            }
          >
            <Icon icon={User} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-[var(--m-text)]">仅自己</span>
              <span className="block text-[12px] text-[var(--m-muted)]">不放进任何空间，只有你能看到</span>
            </span>
            {!travel.spaceId && <Icon icon={Check} size="sm" tone="accent" />}
          </button>

          {spacesLoading && (
            <p className="py-3 text-center text-[13px] text-[var(--m-muted)]">正在加载你的空间…</p>
          )}

          {!spacesLoading &&
            mySpaces.map((s) => {
              const current = travel.spaceId === s.id
              const readOnly = s.myRole === 'VIEWER'
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={movingSpace || readOnly}
                  onClick={() => void moveToSpace(s.id)}
                  className={
                    'flex w-full items-center gap-3 rounded-[var(--m-radius-control)] px-3.5 py-3 text-left disabled:opacity-60 ' +
                    (current ? 'bg-[var(--m-accent-soft)]' : 'bg-[var(--m-surface-2)]')
                  }
                >
                  <Icon icon={Users} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-[var(--m-text)]">{s.name}</span>
                    <span className="block text-[12px] text-[var(--m-muted)]">
                      {readOnly
                        ? '你是只读成员，不能往里添加内容'
                        : `你是${s.myRole === 'OWNER' ? '主人' : '成员'}，空间成员都能看到并一起编辑`}
                    </span>
                  </span>
                  {current && <Icon icon={Check} size="sm" tone="accent" />}
                </button>
              )
            })}

          {!spacesLoading && mySpaces.length === 0 && (
            <p className="rounded-[var(--m-radius-control)] bg-[var(--m-surface-2)] px-3.5 py-3 text-[13px] text-[var(--m-muted)]">
              你还没有共享空间。可以先到「我的 → 我的空间」创建一个情侣 / 家庭 / 朋友空间，再把旅行放进去。
            </p>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}

function DisabledHint() {
  return (
    <div className="m-card px-5 py-8 text-center">
      <Icon icon={CloudOff} size="lg" tone="faint" className="mx-auto" />
      <p className="mt-3 text-sm text-[var(--m-muted)]">这本旅行还在本地待同步</p>
      <p className="mt-1 text-xs text-[var(--m-faint)]">联网后会自动上传，同步完成即可编辑</p>
    </div>
  )
}
