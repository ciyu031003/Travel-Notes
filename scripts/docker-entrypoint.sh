#!/bin/sh
set -e

echo "[entrypoint] 等待 MySQL 就绪..."
node scripts/wait-for-db.cjs

echo "[entrypoint] 应用增量 schema 迁移（幂等）..."
node scripts/apply-schema-migration.cjs || echo "[warn] 增量迁移未完整执行，请检查日志"

echo "[entrypoint] 同步 Prisma schema..."
npx prisma db push 2>&1 || echo "[warn] prisma db push 未完全同步（增量迁移已先行应用，继续启动）"

echo "[entrypoint] 启动 Next.js..."
exec npm run start
