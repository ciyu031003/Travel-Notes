import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPlanDocPayload, createPersistence, createSnapshotLoader, isRetryableStatus } from '../lib/persistence.mjs';

const SECRET = 'unit-test-secret';
const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

function startAppMock({ respond }) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const record = {
      method: req.method,
      url: req.url,
      secret: req.headers['x-collab-secret'],
      body: bodyText ? JSON.parse(bodyText) : null,
    };
    requests.push(record);
    const result = respond(record, requests.length);
    res.writeHead(result.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body ?? {}));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        requests,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

const basePayload = buildPlanDocPayload({
  planId: 42,
  yjsStateBase64: 'AAECAw==',
  materialized: { days: [], items: [], meta: {} },
  presence: [{ userId: 1, username: 'alice', nickname: null, editingItemId: null, cursor: null, clientId: 'c1' }],
  source: 'disconnect',
  clientId: 'instance-1',
  sentAt: '2026-11-28T00:00:00.000Z',
});

describe('buildPlanDocPayload', () => {
  it('字段与契约一致，source 只允许 debounce/disconnect', () => {
    expect(basePayload).toEqual({
      planId: 42,
      yjsState: 'AAECAw==',
      materialized: { days: [], items: [], meta: {} },
      presence: basePayload.presence,
      source: 'disconnect',
      clientId: 'instance-1',
      sentAt: '2026-11-28T00:00:00.000Z',
    });
    expect(buildPlanDocPayload({ planId: 1, yjsStateBase64: 'AA==', materialized: {}, source: 'presence', clientId: 'x' }).source).toBe('debounce');
  });

  it('isRetryableStatus：5xx/408/429 重试，4xx 不重试', () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe('createPersistence.submitPlanDoc', () => {
  let mock;
  afterEach(async () => {
    await mock?.close();
    mock = undefined;
  });

  it('成功提交：URL/头/body 正确', async () => {
    mock = await startAppMock({ respond: () => ({ status: 200, body: { ok: true, revision: 3, eventId: 9 } }) });
    const persistence = createPersistence({ appInternalUrl: mock.url, secret: SECRET, logger: silentLogger, retryDelaysMs: [] });
    const result = await persistence.submitPlanDoc(basePayload);
    expect(result).toMatchObject({ ok: true, attempts: 1, status: 200, body: { revision: 3, eventId: 9 } });
    expect(mock.requests[0].url).toBe('/api/internal/plan-doc/42');
    expect(mock.requests[0].secret).toBe(SECRET);
    expect(mock.requests[0].body).toEqual(basePayload);
  });

  it('5xx 后按间隔重试，第三次成功', async () => {
    mock = await startAppMock({
      respond: (_record, attempt) => (attempt < 3 ? { status: 500, body: { ok: false } } : { status: 200, body: { ok: true, revision: 5 } }),
    });
    const persistence = createPersistence({
      appInternalUrl: mock.url,
      secret: SECRET,
      logger: silentLogger,
      retryDelaysMs: [10, 10],
    });
    const result = await persistence.submitPlanDoc(basePayload);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(mock.requests).toHaveLength(3);
    // 重试期间快照不变
    expect(new Set(mock.requests.map((record) => JSON.stringify(record.body))).size).toBe(1);
  });

  it('4xx 不重试，直接失败并带出响应体片段', async () => {
    mock = await startAppMock({ respond: () => ({ status: 400, body: { ok: false, error: 'bad rows' } }) });
    const persistence = createPersistence({ appInternalUrl: mock.url, secret: SECRET, logger: silentLogger, retryDelaysMs: [10, 10] });
    const result = await persistence.submitPlanDoc(basePayload);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.error).toContain('HTTP 400');
    expect(mock.requests).toHaveLength(1);
  });

  it('全部失败时返回错误，不抛异常', async () => {
    mock = await startAppMock({ respond: () => ({ status: 503, body: { ok: false } }) });
    const persistence = createPersistence({ appInternalUrl: mock.url, secret: SECRET, logger: silentLogger, retryDelaysMs: [5, 5] });
    const result = await persistence.submitPlanDoc(basePayload);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toContain('HTTP 503');
  });

  it('网络错误也会重试并最终返回失败', async () => {
    const persistence = createPersistence({
      appInternalUrl: 'http://127.0.0.1:1',
      secret: SECRET,
      logger: silentLogger,
      retryDelaysMs: [5, 5],
      timeoutMs: 500,
    });
    const result = await persistence.submitPlanDoc(basePayload);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
  });
});

describe('createSnapshotLoader', () => {
  let mock;
  afterEach(async () => {
    await mock?.close();
    mock = undefined;
  });

  it('404 → 空快照（新计划/未同步过）', async () => {
    mock = await startAppMock({ respond: () => ({ status: 404, body: { ok: false } }) });
    const load = createSnapshotLoader({ appInternalUrl: mock.url, secret: SECRET, logger: silentLogger });
    await expect(load(42)).resolves.toEqual({ state: null, source: 'empty', revision: 0, lastEventId: 0 });
  });

  it('200 → 解码 yjsState 并带出 revision/lastEventId', async () => {
    const state = Buffer.from([0, 1, 2, 3]);
    mock = await startAppMock({
      respond: () => ({ status: 200, body: { planId: 42, yjsState: state.toString('base64'), revision: 7, lastEventId: 12 } }),
    });
    const load = createSnapshotLoader({ appInternalUrl: mock.url, secret: SECRET, logger: silentLogger });
    const result = await load(42);
    expect(result.source).toBe('app');
    expect(result.revision).toBe(7);
    expect(result.lastEventId).toBe(12);
    expect([...result.state]).toEqual([0, 1, 2, 3]);
  });

  it('5xx 抛错（房间层降级为空文档）', async () => {
    mock = await startAppMock({ respond: () => ({ status: 500, body: { ok: false } }) });
    const load = createSnapshotLoader({ appInternalUrl: mock.url, secret: SECRET, logger: silentLogger });
    await expect(load(42)).rejects.toThrow(/HTTP 500/);
  });
});
