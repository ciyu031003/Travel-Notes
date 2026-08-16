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

COPY --from=base /app /app

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
