#!/usr/bin/env node
/**
 * 无 Docker 环境下的 docker-compose 结构校验（CI/本地都能跑）。
 *
 * 背景：本机没装 docker，无法执行 `docker compose config -q`（该命令建议在部署机/CI 上再跑一次）。
 * 这里用 YAML 解析 + 关键字段断言替代，保证：
 *   · docker-compose.yml 是合法 YAML；
 *   · realtime 服务的 build/env/ports/healthcheck 与文档一致；
 *   · 既有的 db/app 服务与 mysql-data 卷没有被破坏。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'docker-compose.yml');

const errors = [];
const ok = (message) => console.log(`  ok  ${message}`);
const check = (condition, message) => {
  if (condition) ok(message);
  else errors.push(message);
};

let compose;
try {
  compose = YAML.parse(fs.readFileSync(FILE, 'utf8'));
} catch (err) {
  console.error(`docker-compose.yml 不是合法 YAML: ${err.message}`);
  process.exit(1);
}

console.log(`校验 ${FILE}`);
check(compose && typeof compose === 'object', 'YAML 顶层是对象');
check(compose.services && typeof compose.services === 'object', '存在 services');

const { db, app, realtime } = compose.services ?? {};
check(Boolean(db), '既有 db 服务仍在');
check(Boolean(app), '既有 app 服务仍在');
check(Boolean(realtime), '新增 realtime 服务存在');
check('mysql-data' in (compose.volumes ?? {}), '既有 mysql-data 卷仍在');

if (realtime) {
  check(realtime.build?.context === './realtime', 'realtime.build.context = ./realtime');
  check(realtime.build?.dockerfile === 'Dockerfile', 'realtime.build.dockerfile = Dockerfile');
  check(realtime.container_name === 'travel-notes-realtime', 'realtime.container_name = travel-notes-realtime');
  check(realtime.restart === 'unless-stopped', 'realtime.restart = unless-stopped');
  check(realtime.depends_on?.app?.condition === 'service_healthy', 'realtime 依赖 app 健康后再启动');

  const env = realtime.environment ?? {};
  check('COLLAB_SECRET' in env, 'realtime 注入 COLLAB_SECRET');
  check(String(env.APP_INTERNAL_URL ?? '').includes('http://app:3000'), 'realtime 注入 APP_INTERNAL_URL=http://app:3000');
  check(env.PORT === 1234, 'realtime 注入 PORT=1234');
  check(env.NODE_ENV === 'production', 'realtime 注入 NODE_ENV=production');

  const ports = realtime.ports ?? [];
  check(
    ports.some((entry) => String(entry).includes('127.0.0.1:') && String(entry).endsWith(':1234')),
    'realtime 端口只绑宿主机回环（127.0.0.1:<COLLAB_PORT>:1234）',
  );
  check(Array.isArray(realtime.healthcheck?.test), 'realtime 有 healthcheck');
  check(String(realtime.healthcheck?.test?.join(' ') ?? '').includes('/health'), 'healthcheck 走 /health');
}

if (app) {
  check(app.build?.context === '.', 'app.build.context 未被改动');
  check(String(app.environment?.DATABASE_URL ?? '').includes('@db:3306/travel_notes'), 'app 的 DATABASE_URL 未被改动');
}

if (errors.length > 0) {
  console.error(`\n❌ 校验失败 ${errors.length} 项:`);
  for (const message of errors) console.error(`   - ${message}`);
  process.exit(1);
}
console.log('\n✅ docker-compose.yml 结构校验通过（生产机/CI 建议再跑一次 docker compose config -q）');
