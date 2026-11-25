import type { DeriveTicketInput } from '@/lib/ticket/derive'
import type { TicketData } from '@/lib/ticket/types'

/**
 * Web 票据（吊绳收纳）的数据契约
 * ---------------------------------------------------------------------------
 * 刻意不新建任何接口/请求：这里的一行 = 移动端票据夹里的一行
 * （票面 + 派生入参 + 旅程链里的出发地），由 TicketArchive 已有的
 * /api/travels + lib/ticket/derive 计算结果直接传进来。
 *
 * travel 用 deriveTicket 的原生入参类型（DeriveTicketInput['travel']），
 * 这样两端的字段定义只有一份 —— 票面永远和移动端一致。
 */
export interface WebTicketRow {
  ticket: TicketData
  travel: DeriveTicketInput['travel']
  /** 旅程链里的出发地（上一段的目的地） */
  originCity?: string
}

export interface WebTicketLineProps {
  rows: WebTicketRow[]
  loading: boolean
  error: string
  /** 通过 /tickets?travel=<slug|id> 进来时的旅程标题（非空则显示筛选条） */
  filterTitle?: string | null
  /** 「查看全部」：清掉 travel 筛选 */
  onClearFilter?: () => void
  /** 打开移动端既有的「调整票面」面板（复用，不在 Web 侧重写表单） */
  onEditTicket: (travelId: number) => void
}
