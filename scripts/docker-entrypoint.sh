#!/bin/sh
set -e

echo "[entrypoint] 等待 MySQL 就绪..."
node scripts/wait-for-db.cjs

# 启动路径只跑**范围明确的增量 DDL**（只加列/索引/外键，幂等、不改数据）。
# 反面教材：这里曾经跑的是带"归属回填"的迁移脚本 —— 每次容器重启都会把
# userId IS NULL 的内容静默划给第一个用户，等库里有了第二个真实用户就是数据错误。
# 那个回填已移到 scripts/backfill-ownership-once.cjs，需要显式参数才执行。
echo "[entrypoint] 应用增量 schema 迁移（幂等，仅 DDL）..."
node scripts/apply-schema-migration.cjs || echo "[warn] 增量迁移未完整执行，请检查日志"
node scripts/migrate-r1-profile-cover.cjs || echo "[warn] R1 头图列迁移未完整执行，请检查日志"

echo "[entrypoint] 同步 Prisma schema..."
npx prisma db push 2>&1 || echo "[warn] prisma db push 未完全同步（增量迁移已先行应用，继续启动）"

echo "[entrypoint] 启动 Next.js..."
exec npm run start
