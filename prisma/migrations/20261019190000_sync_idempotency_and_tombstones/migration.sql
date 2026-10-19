-- CreateTable
CREATE TABLE `ClientMutation` (
    `id` VARCHAR(128) NOT NULL,
    `userId` INTEGER NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` INTEGER NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClientMutation_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncTombstone` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` INTEGER NOT NULL,
    `userId` INTEGER NULL,
    `deletedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SyncTombstone_userId_deletedAt_idx`(`userId`, `deletedAt`),
    INDEX `SyncTombstone_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Moment_updatedAt_idx` ON `Moment`(`updatedAt`);

-- CreateIndex
CREATE INDEX `Travel_updatedAt_idx` ON `Travel`(`updatedAt`);

-- CreateIndex
CREATE INDEX `Memory_updatedAt_idx` ON `Memory`(`updatedAt`);

-- CreateIndex
CREATE INDEX `Album_updatedAt_idx` ON `Album`(`updatedAt`);
