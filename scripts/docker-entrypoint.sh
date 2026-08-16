#!/bin/sh
set -e

echo "[entrypoint] 等待 MySQL 就绪..."
node scripts/wait-for-db.cjs

echo "[entrypoint] 同步 Prisma schema..."
npx prisma db push --skip-generate

echo "[entrypoint] 启动 Next.js..."
exec npm run start
