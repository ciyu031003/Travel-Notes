#!/usr/bin/env node
/**
 * P1b 双客户端同步自测（真跑 realtime 服务，不 mock WebSocket）。
 *
 *   cd realtime && node scripts/sync-selftest.mjs          # 退出码 0 = 全部通过
 *   SELFTEST_VERBOSE=1 node scripts/sync-selftest.mjs      # 同时打印 realtime 服务日志
 *
 * 验证项：
 *   1. 无效 token（缺失/错签名/过期/房间不匹配）一律 close(4401)
 *   2. A 改同段 Y.Text，B 实时收到（含毫秒延迟）
 *   3. presence（user/editingItemId/cursor）双向可见，/rooms 调试端点一致
 *   4. 800ms 防抖持久化 POST：base64 Yjs state 可回放、materialized 正确、x-collab-secret 正确
 *   5. 保存失败重试 3 次后成功（injected 500/500 → 200）
 *   6. B 断线期间 A 继续编辑，B 重连后 CRDT 补同步
 *   7. 最后一个客户端断开触发 source=disconnect 的即时回传
 *   8. 服务重启后新客户端从 DB 快照（GET 内部端点）恢复内容
 */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { signCollabToken } from '../lib/token.mjs';

const SECRET = 'selftest-collab-secret-0123456789';
const WRONG_SECRET = 'selftest-wrong-secret';
const PLAN_ID = 42;
const ROOM = `plan-${PLAN_ID}`;
const REALTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STARTED_AT = Date.now();

const timeline = [];
const stepReport = [];
const evidence = {};
let failureCount = 0;

const mark = (event, detail = '') => {
  const entry = { at: new Date().toISOString(), elapsedMs: Date.now() - STARTED_AT, event, detail };
  timeline.push(entry);
  return entry;
};

const log = (...args) => console.log(...args);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(label, predicate, { timeoutMs = 8000, intervalMs = 20 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return { value, elapsedMs: Date.now() - startedAt };
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`等待超时(${timeoutMs}ms): ${label}`);
    }
    await sleep(intervalMs);
  }
}

async function step(name, fn) {
  const startedAt = Date.now();
  log(`\n=== ${name} ===`);
  try {
    const detail = await fn();
    const elapsed = Date.now() - startedAt;
    stepReport.push({ name, ok: true, elapsedMs: elapsed, detail: detail ?? '' });
    log(`PASS ${name} (${elapsed}ms)${detail ? ` :: ${detail}` : ''}`);
    return detail;
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    stepReport.push({ name, ok: false, elapsedMs: elapsed, error: err?.stack || String(err) });
    failureCount += 1;
    log(`FAIL ${name} (${elapsed}ms)`);
    throw err;
  }
}

// ---------------------------------------------------------------- mock app（P1a 内部端点替身）

function readJsonBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) reject(new Error('body too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : null);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function startMockApp({ secret }) {
  const state = {
    posts: [],
    gets: [],
    stored: new Map(),
    revision: 0,
    eventId: 0,
    failures: [],
    unauthorized: 0,
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const sendJson = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    const match = /^\/api\/internal\/plan-doc\/(\d+)$/.exec(url.pathname);
    if (!match) {
      sendJson(404, { ok: false, error: 'not_found' });
      return;
    }
    const planId = Number(match[1]);
    if (req.headers['x-collab-secret'] !== secret) {
      state.unauthorized += 1;
      sendJson(401, { ok: false, error: 'unauthorized' });
      return;
    }
    if (req.method === 'GET') {
      state.gets.push({ at: Date.now(), planId });
      if (state.stored.has(planId)) {
        sendJson(200, {
          planId,
          yjsState: state.stored.get(planId),
          revision: state.revision,
          lastEventId: state.eventId,
        });
      } else {
        sendJson(404, { ok: false, error: 'no_doc' });
      }
      return;
    }
    if (req.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        sendJson(400, { ok: false, error: `bad_json: ${err.message}` });
        return;
      }
      const record = {
        at: Date.now(),
        planId,
        body,
        secretHeader: req.headers['x-collab-secret'],
        contentType: req.headers['content-type'],
        status: null,
      };
      state.posts.push(record);
      if (state.failures.length > 0) {
        record.status = state.failures.shift();
        sendJson(record.status, { ok: false, error: 'injected_failure' });
        return;
      }
      state.stored.set(planId, body.yjsState);
      state.revision += 1;
      state.eventId += 1;
      record.status = 200;
      sendJson(200, {
        ok: true,
        revision: state.revision,
        eventId: state.eventId,
        lastEventId: state.eventId,
        idMap: { days: {}, items: {} },
      });
      return;
    }
    sendJson(405, { ok: false, error: 'method_not_allowed' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    state,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// ---------------------------------------------------------------- realtime 服务进程

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function childExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', resolve));
}

async function startRealtime({ port, appInternalUrl }) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: REALTIME_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      COLLAB_SECRET: SECRET,
      APP_INTERNAL_URL: appInternalUrl,
      COLLAB_SAVE_DEBOUNCE_MS: '250',
      COLLAB_PRESENCE_SAVE_DEBOUNCE_MS: '400',
      COLLAB_SAVE_RETRY_DELAYS_MS: '120,180,240',
      COLLAB_SAVE_TIMEOUT_MS: '2000',
      COLLAB_ROOM_IDLE_TTL_MS: '600000',
      COLLAB_LOG_LEVEL: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  const collect = (chunk) => {
    const text = chunk.toString('utf8');
    logs.push(text);
    if (process.env.SELFTEST_VERBOSE) process.stdout.write(`[realtime] ${text}`);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  await waitFor('realtime /health', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }, { timeoutMs: 15000 });
  return {
    child,
    logs,
    logText: () => logs.join(''),
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await Promise.race([childExit(child), sleep(5000)]);
    },
  };
}

// ---------------------------------------------------------------- Yjs 客户端

function seedDoc(doc, { title }) {
  const days = doc.getArray('days');
  const items = doc.getMap('items');
  const meta = doc.getMap('meta');

  const day = new Y.Map();
  day.set('id', 'd1');
  day.set('date', '2026-12-01');
  day.set('theme', '出发日');
  const dayTitle = new Y.Text();
  dayTitle.insert(0, title);
  day.set('title', dayTitle);

  const item = new Y.Map();
  item.set('id', 'i1');
  item.set('dayId', 'd1');
  item.set('kind', 'TRANSPORT');
  item.set('startAt', '2026-12-01T01:30:00.000Z');
  item.set('costCents', 88000);
  const itemTitle = new Y.Text();
  itemTitle.insert(0, '虹桥 → 首都机场');
  item.set('title', itemTitle);
  const mediaIds = new Y.Array();
  mediaIds.insert(0, [101, 102]);
  item.set('mediaIds', mediaIds);

  doc.transact(() => {
    days.push([day]);
    items.set('i1', item);
    meta.set('departureCity', '上海');
    meta.set('transportMode', 'FLIGHT');
  });
}

async function createClient({ port, token, label }) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}/collab`, ROOM, doc, {
    params: { token },
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  });
  const client = {
    label,
    doc,
    provider,
    awareness: provider.awareness,
    async waitSynced(timeoutMs = 8000) {
      await waitFor(`${label} 完成 sync`, () => provider.synced === true, { timeoutMs, intervalMs: 10 });
    },
    titleText() {
      const day = doc.getArray('days').get(0);
      return day?.get('title');
    },
    titleString() {
      return this.titleText()?.toString() ?? '';
    },
    materialized() {
      const days = doc.getArray('days');
      const items = doc.getMap('items');
      return {
        days: days.length,
        items: items.size,
        title: days.get(0)?.get('title')?.toString() ?? '',
        itemTitles: [...items.values()].map((item) => item.get('title')?.toString() ?? ''),
      };
    },
    destroy() {
      try {
        provider.destroy();
        provider.awareness.destroy();
        doc.destroy();
      } catch {
        /* noop */
      }
    },
  };
  await client.waitSynced();
  return client;
}

function expectClose(url, expectedCode = 4401, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        /* noop */
      }
      reject(new Error(`等待 close 超时: ${url}`));
    }, timeoutMs);
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason?.toString?.() ?? '' });
    });
    ws.on('error', () => {
      /* close 事件会带 code */
    });
  });
}

const tokenFor = (overrides = {}) => signCollabToken({ planId: PLAN_ID, userId: 1, ...overrides }, SECRET);

// ---------------------------------------------------------------- 主流程

async function main() {
  log(`甜途 P1b 实时协同自测 · ${new Date().toISOString()}`);
  const mock = await startMockApp({ secret: SECRET });
  const port = await getFreePort();
  evidence.mockAppUrl = mock.url;
  evidence.port = port;
  mark('mock app 就绪', `${mock.url}（P1a 内部端点替身：GET/POST /api/internal/plan-doc/<planId>）`);

  let realtime = await startRealtime({ port, appInternalUrl: mock.url });
  mark('realtime 服务就绪', `ws://127.0.0.1:${port}/collab`);

  try {
    await step('1. 服务启动 & /health', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert(res.ok, `/health 状态码 ${res.status}`);
      const body = await res.json();
      assert(body.ok === true, '/health 返回 ok !== true');
      assert(body.service === 'travel-notes-realtime', `service 名称异常: ${body.service}`);
      assert(body.secretConfigured === true, 'secretConfigured 应为 true');
      evidence.health = body;
      mark('GET /health 200', JSON.stringify({ rooms: body.rooms, clients: body.clients, saveDebounceMs: body.saveDebounceMs }));
      return `ok, service=${body.service}, rooms=${body.rooms}`;
    });

    await step('2. 非法 token 一律 close(4401)', async () => {
      const base = `ws://127.0.0.1:${port}/collab/`;
      const cases = {
        missing: await expectClose(`${base}${ROOM}`),
        wrongSecret: await expectClose(
          `${base}${ROOM}?token=${encodeURIComponent(signCollabToken({ planId: PLAN_ID, userId: 1 }, WRONG_SECRET))}`,
        ),
        expired: await expectClose(`${base}${ROOM}?token=${encodeURIComponent(tokenFor({ exp: Math.floor(Date.now() / 1000) - 60 }))}`),
        roomMismatch: await expectClose(`${base}plan-43?token=${encodeURIComponent(tokenFor())}`),
        garbage: await expectClose(`${base}${ROOM}?token=not-a-token`),
      };
      for (const [name, result] of Object.entries(cases)) {
        assert(result.code === 4401, `${name} 期望 close 4401，实际 ${result.code}`);
      }
      evidence.authCloseCodes = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, v.code]));
      mark('5 种非法 token 全部 close(4401)', JSON.stringify(evidence.authCloseCodes));
      return Object.entries(cases)
        .map(([k, v]) => `${k}=${v.code}`)
        .join(', ');
    });

    const A = await createClient({ port, token: tokenFor({ userId: 1 }), label: 'A' });
    const B = await createClient({ port, token: tokenFor({ userId: 2 }), label: 'B' });
    mark('客户端 A/B 已连接并完成 sync', `room=${ROOM}`);

    try {
      await step('3. A 种子文档 → B 收到初始结构', async () => {
        seedDoc(A.doc, { title: '第一天·上海出发' });
        await waitFor('B 收到 days[0]', () => B.materialized().days === 1, { timeoutMs: 5000 });
        await waitFor('B 收到 items', () => B.materialized().items === 1, { timeoutMs: 5000 });
        const b = B.materialized();
        assert(b.title === '第一天·上海出发', `B 的 title 不一致: ${b.title}`);
        assert(b.itemTitles[0] === '虹桥 → 首都机场', `B 的 item title 不一致: ${b.itemTitles[0]}`);
        evidence.seed = b;
        return `B: days=${b.days} items=${b.items} title="${b.title}"`;
      });

      await step('4. A 改同段 Y.Text → B 实时收到（CRDT 文本）', async () => {
        const titleA = A.titleText();
        const startedAt = Date.now();
        titleA.insert(titleA.length, '，10:05 已落地');
        const { elapsedMs } = await waitFor('B 收到 A 的文字插入', () => B.titleString().endsWith('，10:05 已落地'), {
          timeoutMs: 3000,
          intervalMs: 5,
        });
        assert(B.titleString() === titleA.toString(), `A/B 文本不一致 A="${titleA.toString()}" B="${B.titleString()}"`);
        evidence.liveText = { elapsedMs, text: B.titleString() };
        mark('A 插入文字 → B 收到', `${elapsedMs}ms, text="${B.titleString()}"`);
        return `B 在 ${elapsedMs}ms 内收到，text="${B.titleString()}"`;
      });

      await step('5. presence 双向可见 + /rooms 一致', async () => {
        A.awareness.setLocalState({
          user: { id: 1, username: 'alice', nickname: '小甜', color: '#ff8800' },
          editingItemId: 12,
          cursor: 3,
        });
        B.awareness.setLocalState({
          user: { id: 2, username: 'bob', nickname: '小途', color: '#0088ff' },
          editingItemId: null,
          cursor: 0,
        });
        const startedAt = Date.now();
        const { elapsedMs } = await waitFor(
          'B 看到 A 的 presence',
          () => [...B.awareness.getStates().values()].some((state) => state?.user?.id === 1),
          { timeoutMs: 3000, intervalMs: 10 },
        );
        const aState = [...B.awareness.getStates().values()].find((state) => state?.user?.id === 1);
        assert(aState.user.nickname === '小甜', `nickname 未转发: ${JSON.stringify(aState.user)}`);
        assert(aState.editingItemId === 12, `editingItemId 未转发: ${aState.editingItemId}`);
        assert(aState.cursor === 3, `cursor 未转发: ${aState.cursor}`);

        await waitFor('A 看到 B 的 presence', () => [...A.awareness.getStates().values()].some((s) => s?.user?.id === 2), {
          timeoutMs: 3000,
          intervalMs: 10,
        });

        const roomsRes = await fetch(`http://127.0.0.1:${port}/rooms?room=${ROOM}`);
        const roomsBody = await roomsRes.json();
        const roomInfo = roomsBody.rooms?.[0];
        assert(roomInfo, '/rooms 未返回房间');
        assert(roomInfo.clients === 2, `/rooms clients 期望 2，实际 ${roomInfo.clients}`);
        const presenceIds = (roomInfo.presence ?? []).map((p) => p.userId).sort((a, b) => a - b);
        assert(JSON.stringify(presenceIds) === '[1,2]', `/rooms presence userIds 异常: ${JSON.stringify(presenceIds)}`);
        evidence.presence = { elapsedMs, roomInfo: { clients: roomInfo.clients, presence: roomInfo.presence } };
        mark('presence 双向可见', `${elapsedMs}ms, /rooms presence=${JSON.stringify(presenceIds)}`);
        return `B 在 ${elapsedMs}ms 内看到 A(nickname=小甜, editingItemId=12)，/rooms clients=2`;
      });

      await step('6. 800ms 防抖持久化 POST（state+materialized+presence+secret）', async () => {
        const { value: post, elapsedMs } = await waitFor(
          '带完整 materialized 的 POST',
          () =>
            mock.state.posts.find(
              (record) =>
                record.status === 200 &&
                record.body?.planId === PLAN_ID &&
                record.body?.materialized?.days?.[0]?.title?.includes('10:05 已落地') &&
                (record.body?.presence ?? []).length === 2,
            ),
          { timeoutMs: 6000 },
        );
        assert(post.secretHeader === SECRET, 'x-collab-secret 头不正确');
        assert(post.contentType === 'application/json', `content-type 异常: ${post.contentType}`);
        assert(post.body.source === 'debounce', `source 期望 debounce，实际 ${post.body.source}`);
        assert(typeof post.body.clientId === 'string' && post.body.clientId.length > 10, 'clientId 缺失');
        assert(typeof post.body.sentAt === 'string', 'sentAt 缺失');

        const replay = new Y.Doc();
        Y.applyUpdate(replay, Buffer.from(post.body.yjsState, 'base64'));
        const replayedTitle = replay.getArray('days').get(0)?.get('title')?.toString();
        assert(replayedTitle === A.titleString(), `yjsState 回放文本不一致: ${replayedTitle}`);
        assert(replay.getMap('items').size === 1, `yjsState 回放 items 数量异常: ${replay.getMap('items').size}`);
        replay.destroy();

        const day = post.body.materialized.days[0];
        assert(day.date === '2026-12-01', `materialized day.date 异常: ${day.date}`);
        assert(day.title === A.titleString(), `materialized day.title 异常: ${day.title}`);
        const item = post.body.materialized.items[0];
        assert(item.kind === 'TRANSPORT', `item.kind 异常: ${item.kind}`);
        assert(item.mediaIds.join(',') === '101,102', `item.mediaIds 异常: ${item.mediaIds}`);
        assert(item.costCents === 88000, `item.costCents 异常: ${item.costCents}`);
        assert(post.body.materialized.meta.departureCity === '上海', 'meta.departureCity 异常');

        evidence.firstPost = {
          elapsedMs,
          source: post.body.source,
          presence: post.body.presence.map((p) => p.userId),
          materialized: post.body.materialized,
          bytes: post.body.yjsState.length,
        };
        mark('收到持久化 POST 200', `source=debounce, presence=2, yjsState 回放一致, bytes=${post.body.yjsState.length}`);
        return `source=debounce, presence=${JSON.stringify(post.body.presence.map((p) => p.userId))}, yjsState bytes=${post.body.yjsState.length}`;
      });

      await step('7. 保存失败重试 3 次后成功（injected 500/500 → 200）', async () => {
        // 等房间彻底安静（无 dirty / 无 inflight / 无待触发保存），避免 presence 回传吃掉注入的失败
        let stablePosts = mock.state.posts.length;
        let stableTicks = 0;
        await waitFor('房间保存静默', async () => {
          const res = await fetch(`http://127.0.0.1:${port}/rooms?room=${ROOM}`);
          const body = await res.json();
          const info = body.rooms?.[0];
          const quiet = info && !info.dirty && !info.inflight && !info.pendingSave;
          const len = mock.state.posts.length;
          stableTicks = quiet && len === stablePosts ? stableTicks + 1 : 0;
          stablePosts = len;
          return stableTicks >= 5;
        }, { timeoutMs: 8000, intervalMs: 60 });

        const marker = mock.state.posts.length;
        mock.state.failures = [500, 500];
        const titleA = A.titleText();
        titleA.insert(titleA.length, '（重试测试）');

        await waitFor('出现 3 次 POST 尝试', () => mock.state.posts.length >= marker + 3, { timeoutMs: 10000 });
        const attempts = mock.state.posts.slice(marker, marker + 3);
        assert(attempts[0].status === 500, `第 1 次尝试期望 500，实际 ${attempts[0].status}`);
        assert(attempts[1].status === 500, `第 2 次尝试期望 500，实际 ${attempts[1].status}`);
        assert(attempts[2].status === 200, `第 3 次尝试期望 200，实际 ${attempts[2].status}`);
        assert(attempts[0].body.yjsState === attempts[2].body.yjsState, '重试期间 yjsState 发生变化（不应重试不同快照）');
        await waitFor('最终落库', () => mock.state.stored.get(PLAN_ID) === attempts[2].body.yjsState, { timeoutMs: 3000 });

        const serverLog = realtime.logText();
        assert(serverLog.includes('第 1 次提交失败'), '服务日志缺少第 1 次重试告警');
        assert(serverLog.includes('ok attempts=3'), '服务日志缺少 attempts=3 的成功记录');
        evidence.retry = { attempts: attempts.map((a) => a.status), serverLogLine: serverLog.split('\n').filter((l) => l.includes('attempts=3')).slice(-1)[0] };
        mark('重试 500/500 → 200 成功', `attempts=${JSON.stringify(attempts.map((a) => a.status))}`);
        return `attempts=500,500,200，同一份 yjsState，服务日志 attempts=3`;
      });

      await step('8. B 断线编辑 → 重连 CRDT 补同步', async () => {
        B.provider.disconnect();
        await sleep(200);
        const titleA = A.titleText();
        titleA.insert(titleA.length, '，离线期间新增');
        const item2 = new Y.Map();
        item2.set('id', 'i2');
        item2.set('dayId', 'd1');
        item2.set('kind', 'FOOD');
        item2.set('title', '午餐：小笼包');
        item2.set('sortOrder', 1);
        A.doc.getMap('items').set('i2', item2);
        await sleep(500);

        const offlineSnapshot = B.materialized();
        assert(!offlineSnapshot.title.includes('离线期间新增'), `B 断线时不应收到新内容: ${offlineSnapshot.title}`);

        B.provider.connect();
        await B.waitSynced();
        const { elapsedMs } = await waitFor(
          'B 重连后补齐离线改动',
          () => B.titleString().includes('离线期间新增') && B.materialized().items === 2,
          { timeoutMs: 6000 },
        );
        assert(B.titleString() === A.titleString(), '重连后 A/B 文本不一致');
        evidence.reconnect = { elapsedMs, title: B.titleString(), items: B.materialized().items };
        mark('B 重连补齐离线改动', `${elapsedMs}ms, items=2, title="${B.titleString()}"`);
        return `重连后 ${elapsedMs}ms 内补齐：items=${B.materialized().items}, title="${B.titleString()}"`;
      });

      await step('9. 最后客户端断开 → 立即 source=disconnect 回传', async () => {
        const marker = mock.state.posts.length;
        const titleBeforeDisconnect = A.titleString();
        A.provider.disconnect();
        B.provider.disconnect();
        const disconnectStartedAt = Date.now();

        const { value: post, elapsedMs } = await waitFor(
          'source=disconnect 的回传',
          () => mock.state.posts.slice(marker).find((record) => record.status === 200 && record.body?.source === 'disconnect'),
          { timeoutMs: 6000 },
        );
        assert(post.body.materialized.days[0].title === titleBeforeDisconnect, 'disconnect 快照文本不一致');
        assert((post.body.presence ?? []).length === 0, `断开后 presence 应为空快照，实际 ${JSON.stringify(post.body.presence)}`);
        assert(post.body.materialized.items.length === 2, `disconnect 快照 items 期望 2，实际 ${post.body.materialized.items.length}`);
        evidence.disconnectFlush = { elapsedMs, at: new Date(disconnectStartedAt).toISOString(), presence: 0, items: 2 };
        mark('最后客户端断开 → source=disconnect 回传', `${elapsedMs}ms, presence=[] items=2`);
        return `断开后 ${elapsedMs}ms 内完成回传（presence=[]，items=2）`;
      });

      const finalTitle = A.titleString();
      A.destroy();
      B.destroy();
      await sleep(300);

      await step('10. 服务重启后从 DB 快照恢复（GET 内部端点）', async () => {
        const storedBefore = mock.state.stored.get(PLAN_ID);
        assert(typeof storedBefore === 'string' && storedBefore.length > 0, '断开回传后 mock 未存到快照');
        const getsBefore = mock.state.gets.length;

        await realtime.stop();
        mark('realtime 已停止，重启中');
        realtime = await startRealtime({ port, appInternalUrl: mock.url });

        const tC = signCollabToken({ planId: PLAN_ID, userId: 3 }, SECRET);
        const C = await createClient({ port, token: tC, label: 'C' });
        try {
          const { elapsedMs } = await waitFor(
            'C 从快照恢复内容',
            () => C.materialized().title.length > 0 && C.materialized().items === 2,
            { timeoutMs: 8000 },
          );
          assert(C.titleString() === finalTitle, `恢复后文本不一致 C="${C.titleString()}" 期望="${finalTitle}"`);
          assert(C.materialized().items === 2, `恢复后 items 期望 2，实际 ${C.materialized().items}`);
          assert(mock.state.gets.length > getsBefore, '服务重启后没有请求 GET /api/internal/plan-doc/<planId>');
          const loadedLog = realtime.logText().includes('快照已载入');
          assert(loadedLog, '服务日志缺少「快照已载入」');
          evidence.restartResume = { elapsedMs, gets: mock.state.gets.length - getsBefore, title: C.titleString() };
          mark('重启后 C 从 DB 快照恢复', `${elapsedMs}ms, items=2, GET 次数=1, title="${C.titleString()}"`);
          return `新客户端 ${elapsedMs}ms 内恢复 title="${C.titleString()}"（GET 快照 1 次，日志「快照已载入」）`;
        } finally {
          C.destroy();
        }
      });
    } finally {
      A.destroy();
      B.destroy();
    }
  } finally {
    await realtime.stop();
    await mock.close();
  }
}

function printSummary() {
  log('\n================ 时间线 ================');
  for (const entry of timeline) {
    log(`+ ${String(entry.elapsedMs).padStart(6)}ms  ${entry.event}${entry.detail ? ` :: ${entry.detail}` : ''}`);
  }
  log('\n================ 结果 ================');
  for (const item of stepReport) {
    log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}  (${item.elapsedMs}ms)${item.detail ? `\n      ${item.detail}` : ''}${item.error ? `\n      ${item.error}` : ''}`);
  }
  log(`\n${failureCount === 0 ? '✅ 全部通过' : `❌ 失败 ${failureCount} 项`} (${stepReport.filter((s) => s.ok).length}/${stepReport.length} 步)`);
  if (evidence && Object.keys(evidence).length > 0) {
    log('\n================ 证据摘要 ================');
    log(JSON.stringify(evidence, null, 2));
  }
}

main()
  .then(() => {
    printSummary();
    process.exit(failureCount === 0 ? 0 : 1);
  })
  .catch((err) => {
    failureCount += 1;
    console.error('\n自测中断:', err?.stack || err);
    printSummary();
    process.exit(1);
  });
