-- AlterTable
-- 空间背景：用户上传的图片（Hero 大图 + 「我的」页方形小图标）。
-- 手写迁移（本机 prisma migrate dev 会因历史 drift 要求 reset，禁止 reset）。
ALTER TABLE `Space` ADD COLUMN `coverUrl` VARCHAR(500) NULL,
    ADD COLUMN `coverThumbUrl` VARCHAR(500) NULL;
