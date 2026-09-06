# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV JWT_SECRET=build-placeholder-not-for-runtime
ENV SESSION_SECRET=build-placeholder-not-for-runtime
RUN npx prisma generate \
 && SKIP_DB_ON_BUILD=1 SKIP_TSC=1 npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

# ffmpeg：视频转码管线依赖。不走 apt（5M 公网带宽拉 400MB 依赖过慢）——
# 由 docker-compose 以只读卷挂载宿主机静态二进制（/usr/local/bin/ffmpeg，见 docker-compose.yml）；
# 缺 ffmpeg 时转码模块自动降级跳过，不影响上传主链路。
COPY --from=base /app /app

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
