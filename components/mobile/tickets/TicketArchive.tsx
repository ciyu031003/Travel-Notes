'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info, Plane, SlidersHorizontal, Sparkles, Ticket } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { Loader } from '@/components/mobile/Loader'
import TicketMini from '@/components/mobile/ticket/TicketMini'
import TicketEditSheet, { type TicketEditTravel } from '@/components/mobile/tickets/TicketEditSheet'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { deriveTicket } from '@/lib/ticket/derive'
import { clearTicketOverride, writeTicketOverride } from '@/lib/ticket/store'
import type { TicketData, TicketOverride } from '@/lib/ticket/types'
import { travelDetailHref } from '@/lib/routes'

/**
 * 票据夹（归档页）
 * ---------------------------------------------------------------------------
 * 数据来源：`/api/travels` 里 **confirmed === true 的旅程**（完成并归档过），
 * 每段旅程按规则派生一张票（机票/高铁/火车，四季×四段主题）。
 *
 * 为什么这里不请求新的票接口：票是旅程的投影，服务器不需要为它存一张表；
 * 用户对票面的微调（交通方式/出发到达/时间/座位）存在 localStorage（lib/ticket/store），
 * 归档页与完成动画共用同一套派生函数，票面因此永远一致。
 *
 * 交互：
 *  1) 点票卡 → 对应旅程详情页；
 *  2) 点卡片右上角「调整票面」→ TicketEditSheet 编辑面板，保存后写覆盖层并重算列表
 *     （票面是纪念卡，覆盖层只影响展示，不写回旅程数据）。
 */

interface TravelItem {
  id: number
  slug: string
  title: string
  location?: string | null
  date?: string | null
  confirmed?: boolean
  tags?: string[]
  /**
   * 服务端保存的票面覆盖（跨设备同步）。
   * 与 localStorage 同一份结构（TicketOverride），服务端有值时优先 ——
   * 本机覆盖只在"还没同步上去/离线"时兜底。
   */
  ticketOverride?: TicketOverride | null
}

/** 一张票 + 它的派生入参：编辑面板要用同一份入参重新派生预览，不能只传票面结果 */
interface TicketRow {
  ticket: TicketData
  travel: TicketEditTravel
  /** 旅程链里的出发地（上一段的目的地） */
  originCity?: string
}

const TRANSPORT_LABEL = { flight: '机票', hsr: '高铁票', train: '火车票' } as const

function yearOf(date: string): string {
  return date.slice(0, 4)
}

/**
 * 列表里的 id 是「post id」= 1_000_000 + travelId（见 /api/travels）。
 * 票面派生/覆盖层/同步接口都要用**真实的 travelId**，否则写回会 404。
 */
function travelIdOf(item: TravelItem): number {
  return item.id >= 1_000_000 ? item.id - 1_000_000 : item.id
}

/** 归档列表项 → deriveTicket 的 travel 入参（与列表派生保持同一份数据，字段一个不多一个不少） */
function travelInputOf(item: TravelItem): TicketEditTravel {
  return {
    id: travelIdOf(item),
    slug: item.slug,
    title: item.title,
    location: item.location ?? null,
    startDate: item.date ?? null,
    tags: item.tags ?? [],
  }
}

export default function TicketArchive() {
  const router = useRouter()
  const [travels, setTravels] = useState<TravelItem[] | null>(null)
  const [passenger, setPassenger] = useState('旅行者')
  const [overrides, setOverrides] = useState<Record<string, TicketOverride>>({})
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  /**
   * 按旅程筛票据：/tickets?travel=<slug|id>
   * 旅行详情页的「票据」入口与票据揭晓的「收进票据夹」都会带上它，
   * 这样点进来先看到的是这一趟的票，而不是全部票。
   * 用 window.location.search 而不是 useSearchParams：静态导出下无需 Suspense 边界。
   */
  const [travelFilter, setTravelFilter] = useState<string | null>(null)
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('travel')
      if (raw) setTravelFilter(decodeURIComponent(raw))
    } catch {
      /* 忽略 */
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [travelRes, meRes] = await Promise.all([
          fetch(apiUrl('/api/travels'), { credentials: 'include', cache: 'no-store' }),
          fetch(apiUrl('/api/me'), { credentials: 'include', cache: 'no-store' }).catch(() => null),
        ])
        if (!travelRes.ok) throw new Error('HTTP ' + travelRes.status)
        const json = await travelRes.json()
        const list: TravelItem[] = (json.posts || []).filter(
          (p: TravelItem) => p && p.slug && p.confirmed !== false,
        )
        if (!alive) return
        setTravels(list)
        // 服务端覆盖层并入本地：服务端有值时优先（跨设备），localStorage 兜底
        const serverOverrides: Record<string, TicketOverride> = {}
        for (const item of list) {
          if (item.ticketOverride && typeof item.ticketOverride === 'object') {
            serverOverrides[String(travelIdOf(item))] = item.ticketOverride
          }
        }
        if (Object.keys(serverOverrides).length > 0) {
          // 服务端优先：跨设备改过的票面，换手机打开也一致
          setOverrides((prev) => ({ ...prev, ...serverOverrides }))
        }
        if (meRes && meRes.ok) {
          const me = await meRes.json().catch(() => null)
          const profile = me?.data ?? me
          const name = profile?.nickname || profile?.username
          if (name) setPassenger(String(name))
        }
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : '加载失败')
        setTravels([])
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // localStorage 里的票面微调：挂载后再读，避免 SSR/水合不一致
  useEffect(() => {
    const next: Record<string, TicketOverride> = {}
    // 一次性读出全部覆盖；store 读取函数是单 key 的，这里要的是整份 map
    try {
      const raw = window.localStorage.getItem('tn:tickets:v1')
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, TicketOverride>
        for (const id of Object.keys(parsed)) next[id] = parsed[id]
      }
    } catch {
      /* 忽略 */
    }
    // 本机覆盖不覆盖已经拿到的服务端值（服务端是跨设备真相；本机只在没有服务端值时兜底）
    setOverrides((prev) => ({ ...next, ...prev }))
  }, [])

  /** 旅程链：按时间升序，后一段的出发地默认是上一段的目的地 */
  const rows = useMemo<TicketRow[]>(() => {
    if (!travels) return []
    const withDate = [...travels].sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : 0
      const bt = b.date ? new Date(b.date).getTime() : 0
      return at - bt
    })
    let originCity: string | undefined
    const chain: TicketRow[] = []
    for (const t of withDate) {
      const travel = travelInputOf(t)
      const ticket = deriveTicket({
        travel,
        passenger,
        originCity,
        // 覆盖层按**真实 travelId** 存（travel.id 已在 travelInputOf 里归一化）
        override: overrides[String(travel.id)],
      })
      chain.push({ ticket, travel, originCity })
      originCity = ticket.to.city
    }
    const ordered = chain.reverse()
    if (!travelFilter) return ordered
    // 按旅程筛：slug 或数字 id 都认（dock 传 slug，旧链接可能传 id）
    const matched = ordered.filter(
      (row) => row.ticket.slug === travelFilter || String(row.ticket.travelId) === travelFilter,
    )
    return matched.length > 0 ? matched : ordered
  }, [travels, passenger, overrides, travelFilter])

  const tickets = useMemo(() => rows.map((row) => row.ticket), [rows])

  /** 当前筛选命中的旅程（用于标题与「查看全部」入口） */
  const filteredTravel = useMemo(
    () => (travelFilter ? rows.find((row) => row.ticket.slug === travelFilter || String(row.ticket.travelId) === travelFilter)?.travel ?? null : null),
    [travelFilter, rows],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, TicketData[]>()
    for (const t of tickets) {
      const key = yearOf(t.date)
      const arr = map.get(key) || []
      arr.push(t)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => Number(b[0]) - Number(a[0]))
  }, [tickets])

  const summary = useMemo(() => {
    const counts = { flight: 0, hsr: 0, train: 0 }
    for (const t of tickets) counts[t.transport]++
    return counts
  }, [tickets])

  /** 正在编辑的那一行（票 + 派生入参）；行随覆盖层重算，编辑面板因此永远显示最新票面 */
  const editing = useMemo(
    () => (editingId == null ? null : rows.find((row) => row.ticket.travelId === editingId) ?? null),
    [editingId, rows],
  )

  const loading = travels === null

  const openEditor = (travelId: number) => {
    setEditingId(travelId)
  }

  /**
   * 票面覆盖写云端（跨设备同步）：本地先落盘保证"立刻就生效"，
   * 网络失败时只提示——本机已经改好了，下次联网再改一次即可。
   */
  const syncOverride = async (travelId: number, override: TicketOverride | null) => {
    try {
      const res = await fetch(apiUrl('/api/travels/' + travelId + '/ticket'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
    } catch {
      toast.error('已保存到本机，云端同步失败，稍后可重试')
    }
  }

  const handleSave = (patch: TicketOverride) => {
    if (!editing) return
    const travelId = editing.ticket.travelId
    const next = writeTicketOverride(travelId, patch)
    setOverrides((prev) => ({ ...prev, [String(travelId)]: next }))
    setEditingId(null)
    toast.success('票面已更新')
    void syncOverride(travelId, next)
  }

  /** 恢复默认票面：清掉该票的覆盖层，列表立刻回到旅程派生的原始票面 */
  const handleReset = () => {
    if (!editing) return
    const travelId = editing.ticket.travelId
    clearTicketOverride(travelId)
    setOverrides((prev) => {
      if (!(String(travelId) in prev)) return prev
      const next = { ...prev }
      delete next[String(travelId)]
      return next
    })
    toast.success('已恢复默认票面')
    void syncOverride(travelId, null)
  }

  return (
    <div className="m-mobile-page m2-screen text-[var(--m-text)]">
      <header className="m2-gutter m-safe-top pb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="返回上一级"
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-text)] shadow-[var(--m-shadow-l1)] transition active:scale-95"
          >
            <Icon icon={ArrowLeft} size="md" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="m2-eyebrow">TRAVEL TICKETS</p>
            <h1 className="mt-0.5 truncate text-[18px] font-bold tracking-[-0.02em] text-[var(--m-text)]">
              {filteredTravel && tickets.length === 1 ? filteredTravel.title : '旅程票据'}
            </h1>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--m-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--m-accent-strong)]">
            {tickets.length} 张
          </span>
        </div>

        {travelFilter && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-[var(--m-accent-soft)] px-3 py-2">
            <span className="min-w-0 truncate text-[13px] text-[var(--m-accent-strong)]">
              {filteredTravel ? '只看《' + filteredTravel.title + '》的票' : '只看这一段旅程'}
            </span>
            <button
              type="button"
              onClick={() => {
                setTravelFilter(null)
                try {
                  window.history.replaceState(null, '', '/tickets')
                } catch {
                  /* 忽略 */
                }
              }}
              className="shrink-0 text-[13px] font-semibold text-[var(--m-accent-strong)]"
            >
              查看全部
            </button>
          </div>
        )}
        {tickets.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--m-muted)]">
            <span className="inline-flex items-center gap-1"><Icon icon={Plane} size="sm" />机票 {summary.flight}</span>
            <span className="inline-flex items-center gap-1"><Icon icon={Ticket} size="sm" />高铁 {summary.hsr}</span>
            <span className="inline-flex items-center gap-1"><Icon icon={Ticket} size="sm" />火车 {summary.train}</span>
          </p>
        )}

        {tickets.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-[var(--m-faint)]">
            <Icon icon={Info} size="sm" className="mt-px shrink-0" />
            <span>可调整票面：改完只影响展示（票面是纪念卡，不改旅程本身）</span>
          </p>
        )}
      </header>

      <main className="m2-gutter pb-10">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader />
          </div>
        ) : error ? (
          <div className="m2-card px-5 py-10 text-center">
            <p className="text-sm font-semibold text-[var(--m-text)]">票据夹加载失败</p>
            <p className="mt-1 text-xs text-[var(--m-muted)]">{error}</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="m2-card px-5 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
              <Icon icon={Ticket} size="lg" />
            </span>
            <p className="mt-3 text-[15px] font-bold text-[var(--m-text)]">还没有票据</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--m-muted)]">
              完成并归档一段旅程后，系统会自动为你生成机票 / 高铁票 / 火车票。
            </p>
            <Link href="/travel/new" className="m-btn m-btn-primary m-btn-sm mt-5 inline-flex">
              记录一段旅程
            </Link>
          </div>
        ) : (
          <div className="space-y-7">
            {grouped.map(([year, list]) => (
              <section key={year}>
                <div className="m-section-title">
                  <span>{year} 年</span>
                  <span className="text-xs text-[var(--m-muted)]">{list.length} 张</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {list.map((ticket) => (
                    // 卡片与「调整票面」是**兄弟节点**而不是把 button 塞进 Link：
                    // 交互元素不能嵌套在 <a> 里（键盘/读屏会乱），这里绝对定位浮在卡片右上角。
                    <div key={ticket.travelId} className="relative pt-6">
                      <Link
                        href={travelDetailHref(ticket.slug)}
                        aria-label={'打开 ' + ticket.title + ' 的' + TRANSPORT_LABEL[ticket.transport]}
                        className="block transition active:scale-[0.98]"
                      >
                        <TicketMini ticket={ticket} />
                      </Link>
                      <button
                        type="button"
                        title="调整票面"
                        aria-label={'调整「' + ticket.title + '」的票面'}
                        onClick={(event) => {
                          // 外层是 Link（卡片整块可点）：必须同时掐掉默认行为与冒泡，
                          // 否则点「调整」会顺带跳到旅程详情页。
                          event.preventDefault()
                          event.stopPropagation()
                          openEditor(ticket.travelId)
                        }}
                        className="m-press absolute right-0 top-0 z-10 flex h-11 w-11 items-start justify-end text-[var(--m-muted)]"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--m-line)] bg-[color-mix(in_srgb,var(--m-surface-solid)_90%,transparent)] text-[var(--m-text)] shadow-[var(--m-shadow-l1)] backdrop-blur-sm">
                          <Icon icon={SlidersHorizontal} size="sm" />
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-[var(--m-faint)]">
              <Icon icon={Sparkles} size="sm" />
              每完成一段旅程，票据会自动归档到这里
            </p>
          </div>
        )}
      </main>

      {editing && (
        <TicketEditSheet
          open
          ticket={editing.ticket}
          travel={editing.travel}
          passenger={passenger}
          originCity={editing.originCity}
          onClose={() => setEditingId(null)}
          onSave={handleSave}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
