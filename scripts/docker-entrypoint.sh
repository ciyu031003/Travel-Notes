#!/bin/sh
set -e

echo "[entrypoint] 等待 MySQL 就绪..."
node scripts/wait-for-db.cjs

# P0-8：schema 变更改由 Prisma Migrate 管理（prisma/migrations/ 是唯一真相）。
# 这里不再跑手写 ALTER，也不再跑 prisma db push：
#  - 手写 DDL 每次重启都重复执行，且曾把 userId IS NULL 的数据静默划给第一个用户；
#  - db push 不产生迁移历史，失败还会被 `|| echo warn` 吞掉，导致应用带旧 schema 启动。
echo "[entrypoint] 迁移基线兼容处理（存量库首次升级时 resolve 基线）..."
node scripts/migrate-bootstrap.cjs

echo "[entrypoint] 执行数据库迁移（prisma migrate deploy，失败即退出）..."
npx prisma migrate deploy

echo "[entrypoint] 启动 Next.js..."
exec npm run start
