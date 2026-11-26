-- CreateTable
-- 空间旅行计划（S3）：多人一起规划下一次旅行（标题/目的地/起止日期/预算/备注/状态 + 共享清单）。
-- 手写迁移：本机 prisma migrate dev 会因历史 drift 要求 reset（禁止 reset 生产同款库），
-- 所以这里按 Prisma 的 CreateTable 规范手写，并用 .tmp/space-plan-migrate.cjs 幂等执行。
-- convertedTravelId 是「一键转成旅行记录」的回填锚点（一对一 @unique，幂等）。
CREATE TABLE `SpaceTravelPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `spaceId` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `destination` VARCHAR(200) NULL,
    `startDate` TIMESTAMP(3) NULL,
    `endDate` TIMESTAMP(3) NULL,
    `budget` DOUBLE NULL,
    `note` TEXT NULL,
    `status` ENUM('PLANNING', 'CONFIRMED', 'DONE') NOT NULL DEFAULT 'PLANNING',
    `tasks` JSON NULL,
    `createdById` INTEGER NULL,
    `createdBy` VARCHAR(255) NULL,
    `convertedTravelId` INTEGER NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `SpaceTravelPlan_convertedTravelId_key`(`convertedTravelId`),
    INDEX `SpaceTravelPlan_spaceId_status_idx`(`spaceId`, `status`),
    INDEX `SpaceTravelPlan_spaceId_startDate_idx`(`spaceId`, `startDate`),
    INDEX `SpaceTravelPlan_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SpaceTravelPlan` ADD CONSTRAINT `SpaceTravelPlan_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `Space`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SpaceTravelPlan` ADD CONSTRAINT `SpaceTravelPlan_convertedTravelId_fkey` FOREIGN KEY (`convertedTravelId`) REFERENCES `Travel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
