# syntax=docker/dockerfile:1
#
# 甜途 · 实时协同服务（P1b）
# 独立 Node 进程（Yjs WebSocket），与 Next.js app 分开部署：
#   · 不参与 next build，镜像很小（yjs + ws + y-protocols，无 devDependencies）
#   · 非 root 运行，仅暴露 1234（compose 里只绑宿主机 127.0.0.1，由 nginx 反代 /collab）
#   · 健康检查走 /health（不依赖 MySQL；持久化失败只会记日志并重试，不影响在线协作）

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# 生产镜像不含 vitest（devDependencies 不装）
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=1234

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.mjs ./
COPY lib ./lib

RUN chown -R node:node /app
USER node

EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||1234)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
