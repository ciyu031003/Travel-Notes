'use client'

import { useEffect, useState } from 'react'
import { FlightTicket } from '@/components/mobile/ticket/FlightTicket'
import { TrainTicket } from '@/components/mobile/ticket/TrainTicket'
import { TicketMini } from '@/components/mobile/ticket/TicketMini'
import TicketFace from '@/components/mobile/ticket/TicketFace'
import TicketScene from '@/components/mobile/ticket/TicketScene'
import { DAYPART_LABEL, DAYPART_ORDER, SEASON_LABEL, SEASON_ORDER, ticketThemeClass } from '@/lib/ticket/theme'
import type { TicketData, TicketDayPart, TicketSeason } from '@/lib/ticket/types'

/**
 * 旅程票据预览台（/dev/ui/tickets，仅开发环境可见）
 * ---------------------------------------------------------------------------
 * 目的：一次看全 16 套**插画天光** × 3 套票面 + 归档小票卡 + 3D 悬浮，
 * 并显式打出每张票的根 class（tk tk-<season>-<daypart>），截图核对时不用猜。
 *
 * 四组取样逻辑（不是随便排的）：
 *   · 插画图鉴 16 格 = 4 季 × 4 时段的全集（只有插画，没有票面文字 → 设计核对用）
 *   · 机票 16 张 = 四季 × 四段的全集（同一段旅程，只有天光变 → 便于比对）
 *   · 高铁 8 张 = 四季 × 清晨/黄昏 · 火车 8 张 = 四季 × 正午/夜晚（浅色票两套形态）
 *   · 3D 悬浮特写 = TicketFace（内建 TicketTilt：hover 跟随 / 触屏拖 >6px 才倾斜）
 */

const TRIPS: TicketData[] = [
  {
    travelId: 1,
    slug: 'dali-spring',
    transport: 'flight',
    number: 'CA 204',
    from: { code: 'PEK', city: '北京' },
    to: { code: 'DLU', city: '大理' },
    date: '2026.03.18',
    departTime: '07:40',
    arriveTime: '11:25',
    seat: '14A',
    gate: 'B12',
    passenger: '林晚',
    price: '¥ 1,280',
    season: 'spring',
    dayPart: 'morning',
    days: 5,
    title: '苍山洱海',
  },
  {
    travelId: 2,
    slug: 'hangzhou-rain',
    transport: 'hsr',
    number: 'G 1372',
    from: { code: 'AOH', city: '上海虹桥' },
    to: { code: 'HGH', city: '杭州东' },
    date: '2026.06.12',
    departTime: '09:12',
    arriveTime: '10:05',
    seat: '06 车 12F',
    gate: 'A3',
    passenger: '林晚',
    price: '¥ 73',
    season: 'summer',
    dayPart: 'noon',
    days: 2,
    title: '西湖梅雨',
  },
  {
    travelId: 3,
    slug: 'lijiang-slow',
    transport: 'train',
    number: 'K 1024',
    from: { code: 'CTU', city: '成都' },
    to: { code: 'LJG', city: '丽江' },
    date: '2026.09.26',
    departTime: '18:20',
    arriveTime: '06:12',
    seat: '08 车 045 号',
    gate: '2',
    passenger: '林晚',
    price: '¥ 168',
    season: 'autumn',
    dayPart: 'evening',
    days: 6,
    title: '去丽江的慢车',
  },
  {
    travelId: 4,
    slug: 'xiamen-weekend',
    transport: 'flight',
    number: 'MF 8302',
    from: { code: 'CAN', city: '广州' },
    to: { code: 'XMN', city: '厦门' },
    date: '2026.12.05',
    departTime: '15:30',
    arriveTime: '16:55',
    seat: '07C',
    gate: 'A18',
    passenger: '林晚',
    price: '¥ 640',
    season: 'winter',
    dayPart: 'dusk',
    days: 3,
    title: '海岛周末',
  },
]

function themed(base: TicketData, season: TicketSeason, dayPart: TicketDayPart): TicketData {
  return { ...base, season, dayPart }
}

const FLIGHT_CASES = SEASON_ORDER.flatMap((season) =>
  DAYPART_ORDER.map((dayPart) => ({ season, dayPart })),
)
const HSR_CASES = SEASON_ORDER.flatMap((season) =>
  (['morning', 'dusk'] as TicketDayPart[]).map((dayPart) => ({ season, dayPart })),
)
const TRAIN_CASES = SEASON_ORDER.flatMap((season) =>
  (['noon', 'evening'] as TicketDayPart[]).map((dayPart) => ({ season, dayPart })),
)

function Section({
  title,
  note,
  children,
  gap = true,
}: {
  title: string
  note?: string
  children: React.ReactNode
  gap?: boolean
}) {
  return (
    <section className="mt-9">
      <h2 className="text-[18px] font-bold text-[var(--m-text)]">{title}</h2>
      {note ? <p className="mt-1 text-[13px] leading-5 text-[var(--m-muted)]">{note}</p> : null}
      <div className={gap ? 'mt-4 flex flex-col gap-4' : 'mt-4'}>{children}</div>
    </section>
  )
}

function Case({ theme, number, children }: { theme: string; number: string; children: React.ReactNode }) {
  return (
    <div data-ticket-case={theme}>
      <p className="mb-1.5 font-mono text-[11px] tracking-[0.08em] text-[var(--m-muted)]">
        {theme} · {number}
      </p>
      {children}
    </div>
  )
}

/** 插画图鉴：只渲染 TicketScene（不带票面文字），用于核对 16 套插画本身 */
function SceneTile({ season, dayPart }: { season: TicketSeason; dayPart: TicketDayPart }) {
  return (
    <div data-atlas-theme={ticketThemeClass(season, dayPart)}>
      <div
        className={
          'relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[var(--m-line)] ' +
          ticketThemeClass(season, dayPart)
        }
      >
        <TicketScene season={season} dayPart={dayPart} />
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--m-muted)]">
        {SEASON_LABEL[season]} · {DAYPART_LABEL[dayPart]}
      </p>
    </div>
  )
}

export default function TicketsPreview() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const flightBase = TRIPS[0]
  const hsrBase = TRIPS[1]
  const trainBase = TRIPS[2]

  return (
    <main
      className="min-h-dvh w-full bg-[var(--m-bg)] pb-20 text-[var(--m-text)]"
      data-preview="tickets"
    >
      <header className="sticky top-0 z-30 border-b border-[var(--m-line)] bg-[var(--m-bg)]/92 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[18px] font-bold">旅程票据 · 票面预览</h1>
            <p className="mt-0.5 text-[11px] text-[var(--m-muted)]">
              16 套插画天光 × 机票 / 高铁 / 火车 + 3D 悬浮
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDark((v) => !v)}
            className="shrink-0 rounded-xl border border-[var(--m-line)] bg-[var(--m-surface-2)] px-3 py-1.5 text-[11px] font-semibold text-[var(--m-text)]"
            data-testid="toggle-dark"
          >
            {dark ? '亮色' : '暗色'}
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[430px] px-4 pt-6">
        <p className="text-[13px] leading-5 text-[var(--m-muted)]">
          季节与天光不再写成「春 · 清晨」，改由分层 CSS/SVG 插画表达（见 app/ticket-art.css 第 11 节）。
          每张票上方是根节点 class（<span className="font-mono text-[11px]">tk tk-season-daypart</span>）。
        </p>

        <Section
          title="插画天光图鉴 · 16 套（纯插画）"
          note="只渲染 TicketScene：季节看花枝/叶冠/银杏/枯枝与飘落物，时段看光源位置、云带与星月灯火"
        >
          <div className="grid grid-cols-2 gap-2.5" data-scene-atlas>
            {SEASON_ORDER.flatMap((season) =>
              DAYPART_ORDER.map((dayPart) => (
                <SceneTile key={season + dayPart} season={season} dayPart={dayPart} />
              )),
            )}
          </div>
        </Section>

        <Section
          title="机票 · 登机牌（16 套）"
          note="整卡铺满插画 + 深色 scrim；票根是半透明天光窗，BOARDING PASS 用 mix-blend-mode 做 knockout 挖空字"
        >
          {FLIGHT_CASES.map(({ season, dayPart }) => (
            <Case
              key={season + dayPart}
              theme={ticketThemeClass(season, dayPart)}
              number={themed(flightBase, season, dayPart).number}
            >
              <FlightTicket ticket={themed(flightBase, season, dayPart)} />
            </Case>
          ))}
        </Section>

        <Section
          title="高铁票 · 电子客票（8 套）"
          note="票头是天光玻璃带：左半仍是铁路青绿，右半让日轮/花瓣/雪粒从青绿里透出来（纸面正文保持干净）"
        >
          {HSR_CASES.map(({ season, dayPart }) => (
            <Case
              key={season + dayPart}
              theme={ticketThemeClass(season, dayPart)}
              number={themed(hsrBase, season, dayPart).number}
            >
              <TrainTicket ticket={themed(hsrBase, season, dayPart)} variant="hsr" />
            </Case>
          ))}
        </Section>

        <Section
          title="火车票 · 纸质票（8 套）"
          note="票顶 40px 是插画天光带（风景小窗），纸面仍是暖米色：蓝色流水号竖条 + 红色车次/检票章"
        >
          {TRAIN_CASES.map(({ season, dayPart }) => (
            <Case
              key={season + dayPart}
              theme={ticketThemeClass(season, dayPart)}
              number={themed(trainBase, season, dayPart).number}
            >
              <TrainTicket ticket={themed(trainBase, season, dayPart)} variant="train" />
            </Case>
          ))}
        </Section>

        <Section
          title="归档小票卡 · TicketMini（一排）"
          note="约 4:3，插画缩略 + 交通徽标 + 三字码 + 日期 + 票号（不再有季节文字标签）；支持 3D 悬浮"
          gap={false}
        >
          <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide" data-mini-row="1">
            <div className="flex w-max gap-2.5">
              {TRIPS.map((trip) => (
                <div key={trip.slug} className="w-[148px] shrink-0">
                  <Case
                    theme={ticketThemeClass(trip.season, trip.dayPart)}
                    number={trip.number}
                  >
                    <TicketMini ticket={trip} />
                  </Case>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section
          title="3D 悬浮 / knockout 特写"
          note="鼠标移上去（或触屏按住横拖 >6px）会跟着指针倾斜：插画/正文/票根按 translateZ 分层视差，高光跟着指针；松手 spring 回正；reduced-motion 下不倾斜"
        >
          <div data-tilt-demo="flight">
            <TicketFace ticket={TRIPS[0]} />
          </div>
          <div data-tilt-demo="mini" className="mt-2 w-[180px]">
            <TicketMini ticket={TRIPS[3]} />
          </div>
        </Section>

        <footer className="mt-10 border-t border-[var(--m-line)] pt-4 text-[11px] leading-5 text-[var(--m-muted)]">
          <p>· 根 class 由 lib/ticket/theme.ts 的 ticketThemeClass() 生成，共 16 套。</p>
          <p>· 插画是分层 CSS 渐变 + 内联 SVG 剪影 + CSS animation：无第三方依赖、无图片、无 canvas。</p>
          <p>· 飘落物 13s / 19s，云带与花枝 26~42s；prefers-reduced-motion: reduce 下全部静止。</p>
          <p>· 二维码/条形码由票号+日期做稳定种子生成（装饰用，不可扫描）。</p>
        </footer>
      </div>
    </main>
  )
}
