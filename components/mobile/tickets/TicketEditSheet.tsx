'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Plane, RotateCcw, Train, TrainFront } from 'lucide-react'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Button } from '@/components/mobile/Button'
import { Field } from '@/components/mobile/Field'
import { Icon } from '@/components/mobile/Icon'
import { TimeField } from '@/components/mobile/TimePicker'
import TicketFace from '@/components/mobile/ticket/TicketFace'
import { cn } from '@/lib/utils'
import { deriveTicket, type DeriveTicketInput } from '@/lib/ticket/derive'
import type { TicketData, TicketOverride, TicketTransport } from '@/lib/ticket/types'

/**
 * 「调整票面」编辑面板（bottom sheet）
 * ============================================================================
 * 票据夹此前是只读的：交通方式、出发/到达、时刻、座位全由旅程派生，用户改不了。
 * 这里把**可覆盖字段**（TicketOverride）暴露成一张表单，保存后写入
 * lib/ticket/store 的 localStorage 覆盖层，列表用同一条派生链重算，票面立刻变。
 *
 * 设计取舍：
 *  · 面板里放**真实票面**（TicketFace）做预览，而不是缩略图 —— 用户调的就是
 *    票面上的三字码/票号/时刻/座位，缩略票卡看不到这些字段，改完等于盲改。
 *  · 交通方式一旦切换，票号前缀（TN/G/K）与座位格式提示跟着换；当前座位格式
 *    与新交通方式不匹配时，用同一条派生规则取该方式的默认座位，避免留下
 *    「机票座位 14A 挂在高铁票上」这种明显不成立的字。
 *  · 出发时间用 TimeField 滚轮而不是原生 type="time"：Android 会拉起系统圆盘
 *    钟表，与全站设计语言割裂（AddItinerarySheet 已因此改用滚轮）。滚轮输出
 *    仍是 HH:mm，提交前再做一次 HH:mm 校验兜底。
 *  · 遮罩/Esc/下拉关闭、焦点圈定、键盘避让全部复用 BottomSheet，交互语言与
 *    「添加行程」抽屉一致。
 */

/** 面板需要的最小旅程形状（与 deriveTicket 的入参一致，不另造数据契约） */
export type TicketEditTravel = DeriveTicketInput['travel']

export interface TicketEditSheetProps {
  open: boolean
  /** 当前派生出的票面：作为表单初值 + 预览基线 */
  ticket: TicketData
  /** 重新派生预览所需的原始旅程（与票据夹列表用的是同一份入参） */
  travel: TicketEditTravel
  passenger: string
  /** 旅程链里的出发地提示（与列表派生一致，否则预览会和列表对不上） */
  originCity?: string
  onClose: () => void
  /** 保存：写 localStorage 覆盖层（父级负责 writeTicketOverride + setState） */
  onSave: (override: TicketOverride) => void
  /** 恢复默认：清掉该票的覆盖层（父级负责 clearTicketOverride + setState） */
  onReset: () => void
}

interface Draft {
  transport: TicketTransport
  fromCity: string
  toCity: string
  number: string
  departTime: string
  seat: string
  gate: string
}

interface TransportOption {
  value: TicketTransport
  label: string
  icon: typeof Plane
  /** 票号提示（航班号 / 车次） */
  numberHint: string
  numberPlaceholder: string
  /** 座位格式提示 */
  seatHint: string
  seatPlaceholder: string
  /** 登机口 / 检票口 */
  gateLabel: string
  gatePlaceholder: string
}

const TRANSPORTS: TransportOption[] = [
  {
    value: 'flight',
    label: '机票',
    icon: Plane,
    numberHint: '如 CA 204',
    numberPlaceholder: 'CA 204',
    seatHint: '如 14A',
    seatPlaceholder: '14A',
    gateLabel: '登机口',
    gatePlaceholder: 'B12',
  },
  {
    value: 'hsr',
    label: '高铁',
    icon: TrainFront,
    numberHint: '如 G 1372',
    numberPlaceholder: 'G 1372',
    seatHint: '如 06 车 12F',
    seatPlaceholder: '06 车 12F',
    gateLabel: '检票口',
    gatePlaceholder: 'A3',
  },
  {
    value: 'train',
    label: '火车',
    icon: Train,
    numberHint: '如 K 1024',
    numberPlaceholder: 'K 1024',
    seatHint: '如 08 车 045 号',
    seatPlaceholder: '08 车 045 号',
    gateLabel: '检票口',
    gatePlaceholder: 'A3',
  },
]

const TRANSPORT_OPTION: Record<TicketTransport, TransportOption> = {
  flight: TRANSPORTS[0],
  hsr: TRANSPORTS[1],
  train: TRANSPORTS[2],
}

/** 票号前缀：派生规则见 lib/ticket/derive.ts 的 numberPrefix */
const NUMBER_PREFIX: Record<TicketTransport, string> = { flight: 'TN', hsr: 'G', train: 'K' }

/** 三种票的座位形态（只用来判断「当前座位对新交通方式是否还成立」） */
const SEAT_SHAPE: Record<TicketTransport, RegExp> = {
  flight: /^\d{1,2}[A-F]$/i,
  hsr: /^\d{1,2}\s*车\s*\d{1,2}[A-F]$/i,
  train: /^\d{1,2}\s*车\s*\d{1,3}\s*号$/,
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function draftOf(ticket: TicketData): Draft {
  return {
    transport: ticket.transport,
    fromCity: ticket.from.city,
    toCity: ticket.to.city,
    number: ticket.number,
    departTime: ticket.departTime,
    seat: ticket.seat,
    gate: ticket.gate,
  }
}

/** 切换交通方式：票号只换自家前缀（数字保留），座位若与新格式不符则取该方式的默认值 */
function switchTransport(
  draft: Draft,
  next: TicketTransport,
  seatDefault: string,
): Draft {
  if (draft.transport === next) return draft
  const prefix = NUMBER_PREFIX[draft.transport]
  const pattern = new RegExp('^' + prefix + '\\s*', 'i')
  const number = pattern.test(draft.number.trim())
    ? draft.number.trim().replace(pattern, NUMBER_PREFIX[next] + ' ')
    : draft.number
  const seat = SEAT_SHAPE[next].test(draft.seat.trim()) ? draft.seat : seatDefault
  return { ...draft, transport: next, number, seat }
}

export default function TicketEditSheet({
  open,
  ticket,
  travel,
  passenger,
  originCity,
  onClose,
  onSave,
  onReset,
}: TicketEditSheetProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(ticket))
  const [error, setError] = useState('')

  // 每次打开都用当前派生值重新填表（同一张票二次打开时不能残留上次未保存的草稿）
  useEffect(() => {
    if (!open) return
    setDraft(draftOf(ticket))
    setError('')
  }, [open, ticket])

  /** 默认票面（无覆盖层）：恢复默认时的初值，也是切交通方式取座位默认值的来源 */
  const baseTicket = useMemo(
    () => deriveTicket({ travel, passenger, originCity }),
    [travel, passenger, originCity],
  )

  const transport = TRANSPORT_OPTION[draft.transport]

  /** 预览：同一条派生链 + 草稿覆盖，输入什么票面就是什么 */
  const previewTicket = useMemo(
    () =>
      deriveTicket({
        travel,
        passenger,
        originCity,
        override: {
          transport: draft.transport,
          fromCity: draft.fromCity.trim() || undefined,
          toCity: draft.toCity.trim() || undefined,
          number: draft.number.trim() || undefined,
          departTime: draft.departTime.trim() || undefined,
          seat: draft.seat.trim() || undefined,
          gate: draft.gate.trim() || undefined,
        },
      }),
    [travel, passenger, originCity, draft],
  )

  const patch = (part: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...part }))

  const submit = () => {
    const departTime = draft.departTime.trim()
    // 兜底校验：滚轮只会产出 HH:mm，但草稿可能来自历史数据/空值，不能让脏值落进覆盖层
    if (departTime && !TIME_RE.test(departTime)) {
      setError('出发时间请用 24 小时制 HH:mm，例如 08:30')
      return
    }
    setError('')
    onSave({
      transport: draft.transport,
      fromCity: draft.fromCity.trim(),
      toCity: draft.toCity.trim(),
      number: draft.number.trim(),
      departTime,
      seat: draft.seat.trim(),
      gate: draft.gate.trim(),
    })
  }

  const reset = () => {
    setError('')
    setDraft(draftOf(baseTicket))
    onReset()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="调整票面">
      <div className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="m-field-label">票面预览</p>
          </div>
          <div className="mx-auto mt-2 max-w-[420px]" data-ticket-preview>
            <TicketFace ticket={previewTicket} />
          </div>
        </div>

        <div>
          <p className="m-field-label">交通方式</p>
          <div
            role="group"
            aria-label="交通方式"
            className="mt-1.5 grid grid-cols-3 gap-1 rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-2)] p-1"
          >
            {TRANSPORTS.map((option) => {
              const active = draft.transport === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setDraft((prev) =>
                      switchTransport(
                        prev,
                        option.value,
                        deriveTicket({
                          travel,
                          passenger,
                          originCity,
                          override: { transport: option.value },
                        }).seat,
                      ),
                    )
                  }
                  className={cn(
                    'm-press flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition',
                    active
                      ? 'bg-[var(--m-cta-bg)] text-[var(--m-on-accent)] shadow-[var(--m-shadow-l1)]'
                      : 'text-[var(--m-muted)]',
                  )}
                >
                  <Icon icon={option.icon} size="sm" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <Field
            className="min-w-0 flex-1"
            name="ticket-from"
            label="出发地"
            placeholder="上海"
            value={draft.fromCity}
            maxLength={12}
            onChange={(event) => patch({ fromCity: event.target.value })}
          />
          <Field
            className="min-w-0 flex-1"
            name="ticket-to"
            label="到达地"
            placeholder="大理"
            value={draft.toCity}
            maxLength={12}
            onChange={(event) => patch({ toCity: event.target.value })}
          />
        </div>

        <Field
          name="ticket-number"
          label={draft.transport === 'flight' ? '航班号' : '车次'}
          hint={transport.numberHint}
          placeholder={transport.numberPlaceholder}
          value={draft.number}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => patch({ number: event.target.value.toUpperCase() })}
        />

        <div>
          <TimeField
            label="出发时间"
            value={draft.departTime}
            onChange={(next) => patch({ departTime: next })}
          />
          <p
            role={error ? 'alert' : undefined}
            className={cn('m-field-hint mt-1.5', error && 'text-[var(--m-danger)]')}
          >
            {error || '24 小时制 HH:mm'}
          </p>
        </div>

        <div>
          <div className="flex gap-3">
            <Field
              className="min-w-0 flex-1"
              name="ticket-seat"
              label="座位"
              placeholder={transport.seatPlaceholder}
              value={draft.seat}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => patch({ seat: event.target.value })}
            />
            <Field
              className="min-w-0 flex-1"
              name="ticket-gate"
              label={transport.gateLabel}
              placeholder={transport.gatePlaceholder}
              value={draft.gate}
              maxLength={8}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => patch({ gate: event.target.value.toUpperCase() })}
            />
          </div>
          <p className="m-field-hint mt-1.5">{transport.seatHint}</p>
        </div>

        {/*
          操作区 sticky 在滚动区底部：表单比视口高（预览 + 六个字段 + 提示），
          保存/恢复默认不能要求用户先滚到底才看得见。
        */}
        <div className="sticky -bottom-[18px] z-10 -mx-[18px] -mb-[18px] flex gap-2.5 border-t border-[var(--m-line)] bg-[var(--m-surface-solid)] px-[18px] pb-[18px] pt-3">
          <Button variant="secondary" icon={RotateCcw} onClick={reset} className="flex-1">
            恢复默认
          </Button>
          <Button icon={Check} onClick={submit} className="flex-1">
            保存
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
