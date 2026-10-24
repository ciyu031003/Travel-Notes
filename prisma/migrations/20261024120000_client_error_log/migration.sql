-- CreateTable
CREATE TABLE `ClientErrorLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(30) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `stack` TEXT NULL,
    `url` VARCHAR(300) NULL,
    `appVersion` VARCHAR(20) NULL,
    `buildNumber` INTEGER NULL,
    `platform` VARCHAR(10) NULL,
    `userId` INTEGER NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClientErrorLog_createdAt_idx`(`createdAt`),
    INDEX `ClientErrorLog_kind_createdAt_idx`(`kind`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

