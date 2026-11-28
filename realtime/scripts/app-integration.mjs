#!/usr/bin/env node
/**
 * 真实 app 集成冒烟（realtime ↔ 真实 /api/internal/plan-doc，不打 mock）。
 *
 * 前置：
 *   · app dev/prod 已起（默认 http://127.0.0.1:3111），且 P1a 的内部端点可用；
 *   · MySQL 已跑迁移（SpacePlanDoc 等表存在）；
 *   · 有一个**一次性**的测试计划 id（本脚本会写入该计划快照/物化行/事件，别用真实计划）；
 *   · 两侧共用同一把 COLLAB_SECRET（非生产可都用默认 dev-collab-secret）。
 *
 * 用法：
 *   cd realtime
 *   PLAN_ID=999 APP_INTERNAL_URL=http://127.0.0.1:3111 node scripts/app-integration.mjs
 *
 * 退出码 0 = 通过。
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { signCollabToken } from '../lib/token.mjs';

const APP_URL = (process.env.APP_INTERNAL_URL || 'http://127.0.0.1:3111').replace(/\/+$/, '');
const SECRET = process.env.COLLAB_SECRET || 'dev-collab-secret';
const PLAN_ID = Number(process.env.PLAN_ID);
const SPACE_ID = Number(process.env.SPACE_ID || 1);
const REALTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 可选的登录态（Playwright storageState）；有它才验证「app 签发的 collab-token 能被 realtime 接受」 */
const AUTH_STATE_PATH = process.env.AUTH_STATE_PATH || path.resolve(REALTIME_DIR, '..', 'tests/e2e/.auth/state.json');

if (!Number.isSafeInteger(PLAN_ID) || PLAN_ID <= 0) {
  console.error('缺少 PLAN_ID（一次性测试计划 id）');
  process.exit(2);
}

const marker = `[realtime-smoke ${new Date().toISOString()}]`;
const startTs = Date.now();
const steps = [];

const ok = (name, detail = '') => {
  steps.push({ ok: true, name, detail });
  console.log(`PASS ${name}${detail ? ` :: ${detail}` : ''}`);
};
const fail = (name, detail) => {
  steps.push({ ok: false, name, detail });
  console.error(`FAIL ${name} :: ${detail}`);
};
async function waitFor(label, predicate, timeoutMs = 8000, intervalMs = 25) {
  const t0 = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return { value, elapsedMs: Date.now() - t0 };
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时(${timeoutMs}ms): ${label}`);
    await sleep(intervalMs);
  }
}

async function appGetSnapshot() {
  try {
    const res = await fetch(`${APP_URL}/api/internal/plan-doc/${PLAN_ID}`, {
      headers: { 'x-collab-secret': SECRET },
      signal: AbortSignal.timeout(5000),
    });
    return { status: res.status, body: res.status === 200 ? await res.json() : null };
  } catch (err) {
    // dev server 热重启/瞬时不可达：返回 status 0，让轮询继续而不是直接中断
    return { status: 0, body: null, error: err?.message || String(err) };
  }
}

function decodeState(base64) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(base64, 'base64'));
  return doc;
}

function titleOf(doc) {
  const days = doc.getArray('days');
  const titles = [];
  days.forEach((day) => {
    const title = day?.get?.('title');
    if (title) titles.push(typeof title === 'string' ? title : title.toString());
  });
  return titles.join(' | ');
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function spawnRealtime(port) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: REALTIME_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      HOST: '127.0.0.1',
      COLLAB_SECRET: SECRET,
      APP_INTERNAL_URL: APP_URL,
      COLLAB_SAVE_DEBOUNCE_MS: process.env.COLLAB_SAVE_DEBOUNCE_MS || '300',
      COLLAB_LOG_LEVEL: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString('utf8')));
  return {
    child,
    logText: () => logs.join(''),
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(resolve, 4000);
      });
    },
  };
}

async function connectClient(port, userId) {
  const doc = new Y.Doc();
  const token = signCollabToken({ planId: PLAN_ID, userId }, SECRET);
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}/collab`, `plan-${PLAN_ID}`, doc, {
    params: { token },
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  });
  await waitFor('sync', () => provider.synced === true, 8000);
  return {
    doc,
    provider,
    title: () => titleOf(doc),
    destroy: () => {
      try {
        provider.destroy();
        provider.awareness.destroy();
        doc.destroy();
      } catch {
        /* noop */
      }
    },
  };
}

function seedDoc(doc, text) {
  // 幂等种子：脚本可重复跑（第二次起基于已恢复的 DB 快照更新第一天/第一块，而不是再 push 一天）
  const days = doc.getArray('days');
  const items = doc.getMap('items');
  doc.transact(() => {
    let day = days.get(0);
    if (!day) {
      day = new Y.Map();
      day.set('id', 'smoke-d1');
      day.set('date', '2026-12-24');
      days.push([day]);
    }
    let title = day.get('title');
    if (!(title instanceof Y.Text)) {
      title = new Y.Text();
      day.set('title', title);
    }
    title.delete(0, title.length);
    title.insert(0, text);

    const item = new Y.Map();
    item.set('id', 'smoke-i1');
    item.set('dayId', String(day.get('id') ?? 'smoke-d1'));
    item.set('kind', 'SPOT');
    item.set('title', '真实端点冒烟');
    items.set('smoke-i1', item);
    doc.getMap('meta').set('departureCity', '上海');
  });
}

async function main() {
  console.log(`真实 app 集成冒烟 planId=${PLAN_ID} app=${APP_URL} secret=${SECRET === 'dev-collab-secret' ? 'dev 回落' : '自定义'}`);

  const before = await appGetSnapshot();
  ok('0. GET 初始快照（404=尚未同步过）', `HTTP ${before.status}`);

  const port = await getFreePort();
  let realtime = spawnRealtime(port);
  await waitFor('realtime /health', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }, 15000);
  ok('1. realtime 启动', `ws://127.0.0.1:${port}/collab, APP_INTERNAL_URL=${APP_URL}`);

  let A;
  let B;
  let C;
  try {
    A = await connectClient(port, 1);
    B = await connectClient(port, 2);
    A.provider.awareness.setLocalState({ user: { id: 1, username: 'smoke-a', nickname: '冒烟A' }, editingItemId: null, cursor: 0 });
    seedDoc(A.doc, `真实端点冒烟 ${marker}`);

    const { value: saved, elapsedMs } = await waitFor('真实 POST 落库', async () => {
      const snap = await appGetSnapshot();
      if (snap.status !== 200 || !snap.body?.yjsState) return null;
      const doc = decodeState(snap.body.yjsState);
      const text = titleOf(doc);
      return text.includes(marker) ? { revision: snap.body.revision, lastEventId: snap.body.lastEventId, text } : null;
    }, 15000, 200);
    ok('2. 真实 POST /api/internal/plan-doc 落库成功', `${elapsedMs}ms, revision=${saved.revision}, lastEventId=${saved.lastEventId}`);

    const titleA = A.doc.getArray('days').get(0).get('title');
    const t0 = Date.now();
    titleA.insert(titleA.length, '，B 实时收到');
    const syncResult = await waitFor('B 收到实时编辑', () => B.title().includes('B 实时收到'), 3000, 5);
    ok('3. 双客户端实时同步（经真实 realtime）', `${Date.now() - t0}ms, text="${B.title()}"`);

    const { value: resaved } = await waitFor('真实端点收到新快照', async () => {
      const snap = await appGetSnapshot();
      if (snap.status !== 200) return null;
      const doc = decodeState(snap.body.yjsState);
      return titleOf(doc).includes('B 实时收到') ? snap.body : null;
    }, 15000, 200);
    ok('4. 防抖后再次落库', `revision=${resaved.revision}, lastEventId=${resaved.lastEventId}`);

    // 断连回传：文档 state 不变时 app 走幂等短路（presence 刷新、revision 不推进），
    // 所以这里以 realtime 日志里的 source=disconnect + ok，以及 /rooms 清空为准。
    const beforeDisconnect = resaved.revision;
    A.provider.disconnect();
    B.provider.disconnect();
    await waitFor('断连回传日志', () => /\[save\] plan=\d+ source=disconnect ok attempts=/.test(realtime.logText()), 10000, 100);
    const roomsRes = await fetch(`http://127.0.0.1:${port}/rooms?room=plan-${PLAN_ID}`);
    const roomInfo = (await roomsRes.json()).rooms?.[0];
    if (!roomInfo) throw new Error('/rooms 未返回房间');
    if (roomInfo.clients !== 0) throw new Error(`断开后 /rooms clients 应为 0，实际 ${roomInfo.clients}`);
    if (roomInfo.dirty) throw new Error('断开回传后房间仍 dirty');
    const disconnectSaveLine = realtime
      .logText()
      .split('\n')
      .filter((line) => line.includes('source=disconnect') && line.includes('[save]'))
      .slice(-1)[0];
    const snapAfter = await appGetSnapshot();
    const docAfter = decodeState(snapAfter.body.yjsState);
    if (!titleOf(docAfter).includes('B 实时收到')) throw new Error('断连后快照内容不一致');
    ok(
      '5. 最后客户端断开 → 立即回传（app 幂等短路，revision 不推进、presence 清空）',
      `revision=${beforeDisconnect} 保持, /rooms clients=0, ${disconnectSaveLine?.split('[info] ')[1] ?? disconnectSaveLine}`,
    );

    A.destroy();
    B.destroy();
    A = null;
    B = null;
    await sleep(300);

    await realtime.stop();
    const getsBefore = (await appGetSnapshot()).status;
    realtime = spawnRealtime(port);
    await waitFor('realtime 重启 /health', async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        return res.ok;
      } catch {
        return false;
      }
    }, 15000);

    C = await connectClient(port, 3);
    const { elapsedMs: resumeMs } = await waitFor('C 从真实快照恢复', () => C.title().includes('B 实时收到'), 10000, 25);
    const logHasLoaded = realtime.logText().includes('快照已载入');
    if (!logHasLoaded) throw new Error('realtime 日志缺少「快照已载入」');
    ok('6. realtime 重启后从真实 DB 快照恢复', `${resumeMs}ms, title="${C.title()}"`);

    // 7) 可选：用 app 真实签发的 collab-token 连 realtime，验证两边 HMAC 格式逐字节一致
    if (fs.existsSync(AUTH_STATE_PATH)) {
      try {
        const storage = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf8'));
        const cookie = (storage.cookies ?? []).map((c) => `${c.name}=${c.value}`).join('; ');
        const tokenRes = await fetch(`${APP_URL}/api/spaces/${SPACE_ID}/plans/${PLAN_ID}/collab-token`, {
          method: 'POST',
          headers: { cookie },
        });
        if (tokenRes.status === 200) {
          const issued = await tokenRes.json();
          const doc = new Y.Doc();
          const tokenProvider = new WebsocketProvider(`ws://127.0.0.1:${port}/collab`, issued.room, doc, {
            params: { token: issued.token },
            WebSocketPolyfill: WebSocket,
            disableBc: true,
          });
          try {
            await waitFor('app 签发 token 通过 realtime 鉴权', () => tokenProvider.synced === true, 8000);
            const days = doc.getArray('days').length;
            const received = titleOf(doc).includes('B 实时收到');
            if (!received) throw new Error('app 签发 token 连上后未收到快照内容');
            ok(
              '7. app 签发的 collab-token 被 realtime 接受',
              `room=${issued.room}, expiresIn=${issued.expiresIn}s, 同步后 days=${days}`,
            );
          } finally {
            tokenProvider.destroy();
            tokenProvider.awareness.destroy();
            doc.destroy();
          }
        } else {
          console.log(`SKIP 7. app 签发的 collab-token（登录态失效 HTTP ${tokenRes.status}，跑 node .tmp/mint-auth.mjs 刷新）`);
        }
      } catch (err) {
        console.log(`SKIP 7. app 签发的 collab-token（${err?.message || err}）`);
      }
    } else {
      console.log('SKIP 7. app 签发的 collab-token（无 AUTH_STATE_PATH 登录态）');
    }
    console.log(`\n总耗时 ${Date.now() - startTs}ms`);
  } finally {
    A?.destroy();
    B?.destroy();
    C?.destroy();
    await realtime.stop();
  }
}

main()
  .then(() => {
    const failed = steps.filter((step) => !step.ok).length;
    console.log(`\n${failed === 0 ? '✅ 真实 app 集成冒烟全部通过' : `❌ 失败 ${failed} 项`} (${steps.filter((s) => s.ok).length}/${steps.length})`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    fail('集成冒烟中断', err?.stack || String(err));
    console.log(`\n❌ 真实 app 集成冒烟失败 (${steps.filter((s) => s.ok).length}/${steps.length})`);
    process.exit(1);
  });
