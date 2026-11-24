'use client'

import { useState } from 'react'
import TicketReveal from '@/components/mobile/ticket/TicketReveal'
import TicketFace from '@/components/mobile/ticket/TicketFace'
import { deriveTicket } from '@/lib/ticket/derive'
import type { TicketData } from '@/lib/ticket/types'

/** 调试页（仅开发环境公开）：预览「完成归档 → 票据旋转揭晓 + 烟花彩带」 */
const SAMPLE = {
  travel: {
    id: 9001,
    slug: 'dev-ticket-sample',
    title: '川西环线，正在路上',
    location: '四川 甘孜',
    startDate: '2026-10-18T07:20:00.000Z',
    endDate: '2026-10-23T00:00:00.000Z',
  },
  passenger: 'sakura',
  originCity: '成都',
}

export default function TicketRevealPreviewPage() {
  const [ticket, setTicket] = useState<TicketData | null>(null)

  const open = (transport: TicketData['transport']) => {
    setTicket(
      deriveTicket({
        travel: SAMPLE.travel,
        passenger: SAMPLE.passenger,
        originCity: SAMPLE.originCity,
        override: { transport },
      }),
    )
  }

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 py-10">
      <h1 className="text-[18px] font-bold text-[var(--m-text)]">票据揭晓 · 预览</h1>
      <p className="mt-1 text-[13px] text-[var(--m-muted)]">点击按钮触发旋转弹出 + 烟花彩带</p>
      <div className="mt-5 flex flex-col gap-2.5">
        <button type="button" className="m-btn m-btn-primary" onClick={() => open('flight')}>
          出机票
        </button>
        <button type="button" className="m-btn m-btn-ghost" onClick={() => open('hsr')}>
          出高铁票
        </button>
        <button type="button" className="m-btn m-btn-ghost" onClick={() => open('train')}>
          出火车票
        </button>
      </div>
      {ticket && (
        <TicketReveal
          ticket={ticket}
          onClose={() => setTicket(null)}
          onOpenTravel={() => setTicket(null)}
          onOpenArchive={() => setTicket(null)}
        >
          <TicketFace ticket={ticket} />
        </TicketReveal>
      )}
    </main>
  )
}
