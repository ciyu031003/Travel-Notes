'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '@/components/mobile/Icon'
import { FlightTicket, TrainTicket } from '@/components/mobile/ticket'
import TicketTilt from '@/components/mobile/ticket/TicketTilt'
import { cn } from '@/lib/utils'
import type { TicketTransport } from '@/lib/ticket/types'
import WebTicketSpotlight from './WebTicketSpotlight'
import { useRevealOnce } from './use-reveal-once'
import { TRANSPORT_ICON_OF, TRANSPORT_SHORT, TRANSPORT_LABEL } from './labels'
import { ArrowRightIcon, ArrowUpRightIcon } from './web-ticket-icons'
import type { WebTicketLineProps, WebTicketRow } from './types'
import './web-tickets.css'

/**
 * Web 票据夹 · 吊绳时间线（桌面端 ≥1024 专属）
 * ============================================================================
 * 用户原话：「用一根时间线把这些票据连起来，每根票据上方显示相应的时间和旅程
 * 简单概括，不像移动端只能做堆叠收纳」。所以这里的形态不是网格，而是**晾衣绳**：
 *
 *   · 一年一根绳（从画面上方垂下），票据用木夹子夹在绳上，按时间从左到右；
 *   · 每张票**上方**挂一块小吊牌：日期 + 旅程标题（就是那段旅程的"简称"）；
 *   · 票面本体直接复用移动端的 FlightTicket / TrainTicket（插画背景已在），
 *     外面套 TicketTilt 拿到 3D 倾斜 + 跟随高光，不重写一套票面；
 *   · 绳上的票轻轻摆（CSS keyframes），hover 抬升、点开是"大票 + 详情"浮层；
 *   · 桌面宽度不够或某年票很多时，绳子本身横向滚动（多列延展）。
 *
 * 数据：完全复用 TicketArchive 已经算好的行（/api/travels + lib/ticket/derive，
 * 含服务端/localStorage 的 ticketOverride），这里只做分组与排版，不发新请求。
 *
 * 移动端：本组件整块在 <1024 时 display:none（见 web-tickets.css 第 0 节），
 * 原来的移动端票据夹 DOM 一行没改。
 * ============================================================================
 */

interface RopeGroup {
  year: string
  items: WebTicketRow[]
}

interface Summary {
  total: number
  counts: Record<TicketTransport, number>
  days: number
  yearSpan: string
}

/** 按年分绳：新的年份在上，绳内按时间从左到右（时间向前） */
function groupRowsByYear(rows: WebTicketRow[]): RopeGroup[] {
  const buckets = new Map<string, WebTicketRow[]>()
  for (const row of rows) {
    const year = row.ticket.date.slice(0, 4) || '—'
    const bucket = buckets.get(year)
    if (bucket) bucket.push(row)
    else buckets.set(year, [row])
  }
  return Array.from(buckets.entries())
    .map(([year, items]) => ({
      year,
      items: items.slice().sort((a, b) => a.ticket.date.localeCompare(b.ticket.date)),
    }))
    .sort((a, b) => b.year.localeCompare(a.year))
}

function summarize(rows: WebTicketRow[]): Summary {
  const counts: Record<TicketTransport, number> = { flight: 0, hsr: 0, train: 0 }
  const years = new Set<string>()
  let days = 0
  for (const row of rows) {
    counts[row.ticket.transport] += 1
    days += row.ticket.days
    const year = row.ticket.date.slice(0, 4)
    if (year) years.add(year)
  }
  const sorted = Array.from(years).sort()
  const yearSpan =
    sorted.length > 1 ? sorted[0] + '–' + sorted[sorted.length - 1] : sorted[0] || '—'
  return { total: rows.length, counts, days, yearSpan }
}

/** 吊绳：一条略带起伏的曲线（viewBox 拉伸铺满，横向滚动时跟着变长） */
function RopeSvg() {
  const path = 'M4 24 C 210 33, 380 15, 560 25 S 880 34, 996 22'
  return (
    <svg className="wt-rope" viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="wt-rope-core" d={path} />
      <path className="wt-rope-twist" d={path} />
    </svg>
  )
}

/** 一张被夹在绳上的票：夹子 → 日期/旅程吊牌 → 票面 */
function TicketHang({ row, onOpen }: { row: WebTicketRow; onOpen: () => void }) {
  const { ticket } = row
  const isFlight = ticket.transport === 'flight'
  const tiltKind = isFlight ? 'flight' : ticket.transport === 'train' ? 'train' : 'hsr'
  const trainVariant = ticket.transport === 'train' ? 'train' : 'hsr'

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
    event.preventDefault()
    onOpen()
  }

  return (
    <li className="wt-hang" data-transport={ticket.transport}>
      <div
        className="wt-hang-inner"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={'展开《' + ticket.title + '》的' + TRANSPORT_LABEL[ticket.transport] + '，' + ticket.date}
        onClick={onOpen}
        onKeyDown={handleKeyDown}
      >
        <div className="wt-clip" aria-hidden="true">
          <div className="wt-clip-body" />
        </div>
        <div className="wt-swing">
          <div className="wt-lift">
            <div className="wt-label">
              <span className="wt-label-date">{ticket.date}</span>
              <span className="wt-label-city">{ticket.to.city}</span>
              {ticket.days > 1 ? <span className="wt-label-days">{ticket.days} 天</span> : null}
              <span className="wt-label-title">{ticket.title}</span>
              <span className="wt-label-hint" aria-hidden="true">
                <ArrowUpRightIcon />
              </span>
            </div>
            <div className="wt-ticket">
              <TicketTilt kind={tiltKind}>
                {isFlight ? (
                  <FlightTicket ticket={ticket} />
                ) : (
                  <TrainTicket ticket={ticket} variant={trainVariant} />
                )}
              </TicketTilt>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

/**
 * 绳尾的「下一站」：一枚空夹子挂在绳子的虚线延长线上。
 * 刻意不放进 .wt-hangs —— 塞进横向滚动条里的话，票一多它就被推出视口。
 */
function NextStop() {
  return (
    <div className="wt-next">
      <span className="wt-clip wt-clip-empty" aria-hidden="true">
        <span className="wt-clip-body" />
      </span>
      <div className="wt-next-copy">
        <p className="wt-ghost-kicker">NEXT STOP</p>
        <p className="wt-next-title">留一个空夹子，等下一次出发</p>
      </div>
      <Link className="wt-btn" href="/travel/new">
        记录一段旅程
        <ArrowRightIcon />
      </Link>
    </div>
  )
}

/** 一年一根绳（进入视口一次性渐入） */
function RopeLine({ group, onOpen }: { group: RopeGroup; onOpen: (row: WebTicketRow) => void }) {
  const { ref, shown } = useRevealOnce<HTMLElement>()
  const scrollerRef = useRef<HTMLDivElement>(null)
  /** 绳子比视口长时才给"还能往右拖"的提示（没溢出时不出现，避免多余装饰） */
  const [overflow, setOverflow] = useState({ more: false, atEnd: false })

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      const next = { more: max > 2, atEnd: el.scrollLeft >= max - 2 }
      // 滚动时每帧都会触发：值没变就不 setState，避免整行重渲染
      setOverflow((prev) => (prev.more === next.more && prev.atEnd === next.atEnd ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [group.items.length])

  const headingId = 'wt-year-' + group.year
  const showFade = overflow.more && !overflow.atEnd

  return (
    <section
      ref={ref}
      className={cn('wt-line', shown && 'is-in', showFade && 'is-scrollable')}
      aria-labelledby={headingId}
    >
      <div className="wt-line-head">
        <h2 className="wt-year" id={headingId}>
          {group.year}
        </h2>
        <p className="wt-year-meta">{group.items.length} 张票</p>
        <span className="wt-line-rule" aria-hidden="true" />
      </div>

      <div className="wt-rope-wrap">
        <div className="wt-rope-scroller" ref={scrollerRef}>
          <div className="wt-rope-canvas">
            <RopeSvg />
            <span className="wt-anchor wt-anchor-l" aria-hidden="true" />
            <span className="wt-anchor wt-anchor-r" aria-hidden="true" />
            <ul className="wt-hangs">
              {group.items.map((row) => (
                <TicketHang key={row.ticket.travelId} row={row} onOpen={() => onOpen(row)} />
              ))}
            </ul>
          </div>
        </div>
        <span className="wt-line-fade" aria-hidden="true" />
      </div>

      {overflow.more ? (
        <p className={cn('wt-line-hint', !showFade && 'is-dimmed')}>
          <ArrowRightIcon />
          横向拖动，这一年的票还有更多
        </p>
      ) : null}
    </section>
  )
}

function SummaryPanel({ summary }: { summary: Summary }) {
  const modes: TicketTransport[] = ['flight', 'hsr', 'train']
  return (
    <aside className="wt-summary" aria-label="票据总览">
      <div className="wt-summary-head">
        <p className="wt-summary-label">收纳总览</p>
        <span className="wt-summary-dot" aria-hidden="true" />
      </div>

      <div className="wt-stats">
        <div className="wt-stat">
          <span className="wt-stat-num">{summary.total}</span>
          <span className="wt-stat-label">张票据</span>
        </div>
        <div className="wt-stat">
          <span className="wt-stat-num">{summary.total}</span>
          <span className="wt-stat-label">段旅程</span>
        </div>
        <div className="wt-stat">
          <span className="wt-stat-num wt-stat-num-sm">{summary.yearSpan}</span>
          <span className="wt-stat-label">年份</span>
        </div>
      </div>

      <ul className="wt-modes">
        {modes.map((mode) => (
          <li key={mode} className="wt-mode" data-zero={summary.counts[mode] === 0}>
            <Icon icon={TRANSPORT_ICON_OF[mode]} size="sm" />
            <span>{TRANSPORT_SHORT[mode]}</span>
            <b>{summary.counts[mode]}</b>
          </li>
        ))}
      </ul>

      <p className="wt-summary-note">在路上 {summary.days} 天</p>
    </aside>
  )
}

function EmptyLine() {
  return (
    <div className="wt-empty">
      <div>
        <p className="wt-eyebrow">EMPTY LINE</p>
        <h2 className="wt-empty-title">吊绳还空着</h2>
        <div className="wt-actions">
          <Link className="wt-btn wt-btn-primary" href="/travel/new">
            记录一段旅程
            <ArrowRightIcon />
          </Link>
          <Link className="wt-btn" href="/travel">
            看看已有的旅程
          </Link>
        </div>
      </div>
      <div className="wt-empty-rope" aria-hidden="true">
        <RopeSvg />
        <span className="wt-anchor wt-anchor-l" />
        <span className="wt-anchor wt-anchor-r" />
        <span className="wt-clip wt-clip-empty wt-empty-clip">
          <span className="wt-clip-body" />
        </span>
        <span className="wt-empty-tag">下一张票 · 等你出发</span>
      </div>
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="wt-error" role="alert">
      <div>
        <p className="wt-eyebrow">LOAD ERROR</p>
        <h2 className="wt-error-title">票据夹没能挂起来</h2>
        <p className="wt-error-lede">加载 /api/travels 失败：{message}。刷新页面或稍后再试。</p>
        <div className="wt-actions">
          <Link className="wt-btn" href="/travel">
            去看看旅程
          </Link>
        </div>
      </div>
    </div>
  )
}

function LoadingLines() {
  return (
    <>
      <p className="wt-sr" role="status">
        正在加载票据…
      </p>
      <div className="wt-lines" aria-hidden="true">
        {[0, 1].map((line) => (
          <div className="wt-line is-in" key={line}>
            <div className="wt-line-head">
              <span className="wt-skel wt-skel-year" />
              <span className="wt-line-rule" />
            </div>
            <div className="wt-rope-scroller">
              <div className="wt-rope-canvas">
                <RopeSvg />
                <ul className="wt-hangs">
                  {[0, 1].map((card) => (
                    <li className="wt-hang" key={card}>
                      <span className="wt-skel wt-skel-card" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function WebTicketLine({
  rows,
  loading,
  error,
  filterTitle,
  onClearFilter,
  onEditTicket,
}: WebTicketLineProps) {
  const groups = useMemo(() => groupRowsByYear(rows), [rows])
  const summary = useMemo(() => summarize(rows), [rows])
  /** 浮层翻票顺序 = 吊绳的阅读顺序（新的一年从上到下，绳内从左到右） */
  const ordered = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const openTicket = openIndex != null ? (ordered[openIndex] ?? null) : null

  const openRow = (row: WebTicketRow) => {
    const index = ordered.indexOf(row)
    if (index >= 0) setOpenIndex(index)
  }

  const handleEdit = () => {
    if (!openTicket) return
    const travelId = openTicket.ticket.travelId
    // 先收起浮层：编辑面板（BottomSheet，z 135）要压在页面上，两个浮层同开焦点会乱
    setOpenIndex(null)
    onEditTicket(travelId)
  }

  return (
    <div className="wt-page">
      <div className="wt-shell">
        <header className="wt-hero">
          <div className="wt-hero-copy">
            <p className="wt-eyebrow">TICKET ARCHIVE · 票据收纳</p>
            <h1 className="wt-title">
              把每一段出发，
              <br />
              <em>挂成一条线</em>
            </h1>
            <div className="wt-actions">
              <Link className="wt-btn wt-btn-primary" href="/travel/new">
                记录一段旅程
                <ArrowRightIcon />
              </Link>
              <Link className="wt-btn" href="/travel">
                全部旅程
              </Link>
            </div>
          </div>
          <SummaryPanel summary={summary} />
        </header>

        {filterTitle ? (
          <div className="wt-filter">
            <span>
              只看 <b>《{filterTitle}》</b> 的票
            </span>
            <button type="button" className="wt-filter-btn" onClick={onClearFilter}>
              查看全部
            </button>
          </div>
        ) : null}

        <div className="wt-hero-rule" aria-hidden="true" />

        {loading ? (
          <LoadingLines />
        ) : error ? (
          <ErrorLine message={error} />
        ) : ordered.length === 0 ? (
          <EmptyLine />
        ) : (
          <>
            <div className="wt-lines">
              {groups.map((group) => (
                <RopeLine key={group.year} group={group} onOpen={openRow} />
              ))}
            </div>
            <NextStop />
          </>
        )}

        <footer className="wt-foot">
          <div className="wt-foot-links">
            <Link className="wt-foot-link" href="/travel">
              全部旅程
            </Link>
            <Link className="wt-foot-link" href="/tickets">
              票据夹
            </Link>
          </div>
        </footer>
      </div>

      {openTicket ? (
        <WebTicketSpotlight
          ticket={openTicket.ticket}
          index={openIndex ?? 0}
          total={ordered.length}
          onClose={() => setOpenIndex(null)}
          onPrev={
            openIndex != null && openIndex > 0 ? () => setOpenIndex((openIndex ?? 0) - 1) : undefined
          }
          onNext={
            openIndex != null && openIndex < ordered.length - 1
              ? () => setOpenIndex((openIndex ?? 0) + 1)
              : undefined
          }
          onEdit={handleEdit}
        />
      ) : null}
    </div>
  )
}
