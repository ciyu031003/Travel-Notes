-- AlterTable
-- 行前纪念票面的用户覆盖（机票/高铁/火车 的出发地、交通方式、车次、时刻、座位…）。
-- 结构见 lib/ticket/types.ts 的 TicketOverride；NULL = 用旅程自动派生的票面。
-- 2026-11-26：票面编辑原先只存 localStorage（换设备丢），落库做跨设备同步。
ALTER TABLE `Travel` ADD COLUMN `ticketOverride` JSON NULL;
