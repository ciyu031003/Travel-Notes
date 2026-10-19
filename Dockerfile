# syntax=docker/dockerfile:1
#
# 三阶段构建（P2-33）：
#   deps    → 只装依赖（源码改动不会让这层缓存失效）
#   builder → 装全量依赖并 next build
#   runner  → 只带运行必需文件 + 剪掉 devDependencies + 非 root 运行
#
# 之前 runner 直接 COPY --from=base /app /app，把 1.27GB node_modules（含 eslint/
# playwright/@lhci/cli）、源码、tests、docs 全塞进生产镜像，且默认 root 运行、无健康检查。
# 这里改用显式白名单拷贝 + npm prune --omit=dev，并降权到 node 用户。

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期占位密钥：仅用于 next build 的静态求值，不进运行时（compose 会用真实值覆盖）
ENV JWT_SECRET=build-placeholder-not-for-runtime
ENV SESSION_SECRET=build-placeholder-not-for-runtime

# 先生成 Prisma Client：deps 阶段 npm ci 时仓库里还没有 schema.prisma，postinstall 不会生成；
# 而下面的门禁（typecheck/test）会 import @prisma/client 的类型与运行时，必须先有 .prisma/client。
RUN npx prisma generate

# P0-7 发布门禁：镜像构建即门禁 —— 类型检查 / lint 预算 / 全量单测任一失败都让 docker build 失败。
# 之前 builder 是 SKIP_TSC=1 且完全跳过 lint/test，导致「本地改完直接打包 scp 上线」可以绕过 CI。
# lint 预算与 .github/workflows/ci.yml 保持一致（486 = 2026-10-18 P0 阶段实测存量，只许下调，不许为了过而放大）。
RUN npm run typecheck \
 && npm run lint \
 && npm test

RUN SKIP_DB_ON_BUILD=1 npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 先拷全量 node_modules 再 prune：比在 builder 里 prune 安全（builder 还要用 devDeps 构建），
# 也避免把 devDeps 的 .bin 链接带进运行层。
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
RUN npm prune --omit=dev && npm cache clean --force

# 运行期白名单：Next 产物、静态资源、Prisma schema/config、entrypoint 依赖的脚本。
# 注意：public/uploads 由 docker-compose 的 bind mount 覆盖（媒体在 COS 挂载的宿主机目录）。
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R node:node /app

# 非 root 运行。容器内 uid=1000：宿主机 /data/travel-notes/uploads 必须 chown 1000:1000，
# 否则上传/转码写文件会 EACCES（见 docs/DEPLOYMENT.md「升级注意」）。
USER node

EXPOSE 3000

# 探活与 compose 用同一接口；DB 挂了 /api/health 返回 503 → unhealthy。
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
