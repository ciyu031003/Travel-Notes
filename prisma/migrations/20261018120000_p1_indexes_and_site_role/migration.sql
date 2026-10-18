-- AlterTable
ALTER TABLE `User` ADD COLUMN `siteRole` VARCHAR(20) NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX `User_siteRole_idx` ON `User`(`siteRole`);

-- CreateIndex
CREATE INDEX `SpaceMember_userId_status_idx` ON `SpaceMember`(`userId`, `status`);

-- CreateIndex
CREATE INDEX `SpaceMember_username_status_idx` ON `SpaceMember`(`username`, `status`);

-- CreateIndex
CREATE INDEX `Memory_travelId_idx` ON `Memory`(`travelId`);

-- CreateIndex
CREATE INDEX `Media_storageKey_idx` ON `Media`(`storageKey`);

-- CreateIndex
CREATE INDEX `Album_travelId_idx` ON `Album`(`travelId`);
