import type { Metadata } from 'next'
import TicketArchive from '@/components/mobile/tickets/TicketArchive'

export const metadata: Metadata = {
  title: '旅程票据 · 甜途',
  description: '每一段旅程，都有一张自己的票：机票、高铁票、火车票。',
}

export default function TicketsPage() {
  return <TicketArchive />
}
