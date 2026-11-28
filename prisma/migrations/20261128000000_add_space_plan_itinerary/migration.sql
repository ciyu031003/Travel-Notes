-- P1 计划结构化 + 实时协同（docs/plan-p1-collab-spec.md §1）
--
-- 手写迁移：本库 prisma migrate dev 会因历史 drift 要求 reset（禁止 reset 生产同款库），
-- 所以这里按 Prisma 的 CreateTable/AddForeignKey 规范手写，并由 .tmp/plan-p1-migrate.cjs 幂等执行。
--
-- 内容：
--   ① SpaceTravelPlan 增补 planMeta / coverMediaId / docRevision / version；
--   ② 新建 SpacePlanDay / SpacePlanItem / SpacePlanItemMedia / SpacePlanDoc / SpacePlanEvent / SpacePlanPresence。
--
-- 兼容/回滚：新增列全部可空或带默认值，老代码不读新列、老计划没有天/块 → 读取返回空数组；
-- 回滚只需停用新接口，DDL 可保留（不破坏现有读写）。

-- AlterTable：计划级元信息 + 封面 + Yjs 文档修订号 + 计划级乐观锁
ALTER TABLE `SpaceTravelPlan`
    ADD COLUMN `planMeta` JSON NULL,
    ADD COLUMN `coverMediaId` INTEGER NULL,
    ADD COLUMN `docRevision` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

-- CreateTable：计划中的一天
CREATE TABLE `SpacePlanDay` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `date` DATE NULL,
    `title` VARCHAR(120) NULL,
    `theme` VARCHAR(60) NULL,
    `summary` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `updatedBy` VARCHAR(255) NULL,
    `updatedAt` TIMESTAMP(3) NOT NULL,

    INDEX `SpacePlanDay_planId_date_idx`(`planId`, `date`),
    UNIQUE INDEX `SpacePlanDay_planId_sortOrder_key`(`planId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable：计划中的一块（交通/住宿/餐饮/景点/活动/机动）
CREATE TABLE `SpacePlanItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dayId` INTEGER NOT NULL,
    `kind` ENUM('TRANSPORT', 'HOTEL', 'FOOD', 'SPOT', 'ACTIVITY', 'FLEX') NOT NULL DEFAULT 'SPOT',
    `startAt` TIMESTAMP(3) NULL,
    `endAt` TIMESTAMP(3) NULL,
    `title` VARCHAR(200) NOT NULL,
    `place` VARCHAR(200) NULL,
    `costCents` INTEGER NULL,
    `note` TEXT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneBy` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `updatedBy` VARCHAR(255) NULL,
    `updatedAt` TIMESTAMP(3) NOT NULL,

    INDEX `SpacePlanItem_dayId_sortOrder_idx`(`dayId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable：块级照片（协同时可单独增删）
CREATE TABLE `SpacePlanItemMedia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `mediaId` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `SpacePlanItemMedia_mediaId_idx`(`mediaId`),
    UNIQUE INDEX `SpacePlanItemMedia_itemId_mediaId_key`(`itemId`, `mediaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable：Yjs 文档快照 + 事件游标
CREATE TABLE `SpacePlanDoc` (
    `planId` INTEGER NOT NULL,
    `state` LONGBLOB NOT NULL,
    `lastEvent` INTEGER NOT NULL DEFAULT 0,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` TIMESTAMP(3) NOT NULL,

    PRIMARY KEY (`planId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable：计划事件（增量广播/断线补播/审计）；id 单调递增 = 游标
CREATE TABLE `SpacePlanEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `actor` VARCHAR(255) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SpacePlanEvent_planId_id_idx`(`planId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable：在线状态（谁在看/谁在编辑哪一块）
CREATE TABLE `SpacePlanPresence` (
    `planId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `nickname` VARCHAR(255) NULL,
    `editingItemId` INTEGER NULL,
    `cursor` INTEGER NULL,
    `lastSeenAt` TIMESTAMP(3) NOT NULL,

    INDEX `SpacePlanPresence_planId_lastSeenAt_idx`(`planId`, `lastSeenAt`),
    PRIMARY KEY (`planId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey：级联删除（删计划即清掉天/块/快照/事件/在线状态，不留孤儿行）
ALTER TABLE `SpacePlanDay` ADD CONSTRAINT `SpacePlanDay_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SpaceTravelPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SpacePlanItem` ADD CONSTRAINT `SpacePlanItem_dayId_fkey` FOREIGN KEY (`dayId`) REFERENCES `SpacePlanDay`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SpacePlanItemMedia` ADD CONSTRAINT `SpacePlanItemMedia_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `SpacePlanItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SpacePlanItemMedia` ADD CONSTRAINT `SpacePlanItemMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `Media`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SpacePlanDoc` ADD CONSTRAINT `SpacePlanDoc_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SpaceTravelPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SpacePlanEvent` ADD CONSTRAINT `SpacePlanEvent_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SpaceTravelPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SpacePlanPresence` ADD CONSTRAINT `SpacePlanPresence_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SpaceTravelPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
