/**
 * 旅程票据票面组件（纯展示层）
 * ---------------------------------------------------------------------------
 * 三种票面 + 一个归档缩略卡。全部无状态、无交互、无路由依赖：
 * 交互（完成动画 / 点击进详情 / 编辑票面）由父级组合。
 *
 * 用法：
 *   <FlightTicket ticket={ticket} />
 *   <TrainTicket ticket={ticket} />            // variant 缺省按 transport 推断
 *   <TrainTicket ticket={ticket} variant="hsr" />
 *   <TicketMini ticket={ticket} />             // 外层自己包 <Link>
 */
export { FlightTicket, type FlightTicketProps } from './FlightTicket'
export { TrainTicket, type TrainTicketProps, type TrainTicketVariant } from './TrainTicket'
export { TicketMini, type TicketMiniProps } from './TicketMini'
