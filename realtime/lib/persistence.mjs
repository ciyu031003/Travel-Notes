/**
 * 持久化回传：把 Yjs state + 物化 rows POST 给 app 的内部端点。
 *
 *   POST ${APP_INTERNAL_URL}/api/internal/plan-doc/<planId>
 *   header: x-collab-secret: <COLLAB_SECRET>
 *   body  : { planId, yjsState(base64), materialized, presence, source, clientId, sentAt }
 *
 * 失败重试：默认 3 次（间隔 250/500/1000ms，可由 COLLAB_SAVE_RETRY_DELAYS_MS 覆盖）；
 * 网络错误 / 超时 / 5xx / 408 / 429 会重试，4xx（参数/鉴权/计划不存在）立即失败并记录响应体片段。
 */
const RETRYABLE_STATUS = new Set([408, 425, 429]);

export const isRetryableStatus = (status) => status >= 500 || RETRYABLE_STATUS.has(status);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function buildPlanDocPayload({ planId, yjsStateBase64, materialized, presence, source, clientId, sentAt }) {
  return {
    planId: Number(planId),
    yjsState: yjsStateBase64,
    materialized,
    presence: presence ?? [],
    source: source === 'disconnect' ? 'disconnect' : 'debounce',
    clientId,
    sentAt: sentAt ?? new Date().toISOString(),
  };
}

/**
 * @param {{
 *   appInternalUrl: string,
 *   secret: string,
 *   logger: { info: Function, warn: Function, error: Function },
 *   timeoutMs?: number,
 *   retryDelaysMs?: number[],
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export function createPersistence({
  appInternalUrl,
  secret,
  logger,
  timeoutMs = 8000,
  retryDelaysMs = [250, 500, 1000],
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('运行时缺少 fetch（需要 Node >= 18）');
  const base = String(appInternalUrl).replace(/\/+$/, '');

  const request = async (planId, payload) => {
    const url = `${base}/api/internal/plan-doc/${encodeURIComponent(planId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-collab-secret': secret,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let text = '';
      try {
        text = await res.text();
      } catch {
        text = '';
      }
      let body = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
      return { status: res.status, ok: res.ok, body, text };
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * 提交一次快照；永不 throw（结果通过返回值表达），调用方负责日志与重试排期。
   * @returns {Promise<{ ok: boolean, attempts: number, status?: number, body?: any, error?: string, tookMs: number }>}
   */
  async function submitPlanDoc(payload) {
    const startedAt = Date.now();
    let attempts = 0;
    let lastError = 'unknown';

    for (let i = 0; i <= retryDelaysMs.length; i += 1) {
      attempts += 1;
      try {
        const res = await request(payload.planId, payload);
        if (res.ok) {
          return { ok: true, attempts, status: res.status, body: res.body, tookMs: Date.now() - startedAt };
        }
        lastError = `HTTP ${res.status}${res.text ? `: ${res.text.slice(0, 500)}` : ''}`;
        if (!isRetryableStatus(res.status)) {
          logger.error(`[persist] plan=${payload.planId} 不可重试的 HTTP ${res.status}，放弃本次保存: ${res.text?.slice(0, 500) ?? ''}`);
          return { ok: false, attempts, status: res.status, body: res.body, error: lastError, tookMs: Date.now() - startedAt };
        }
        logger.warn(`[persist] plan=${payload.planId} 第 ${attempts} 次提交失败: HTTP ${res.status}`);
      } catch (err) {
        const isTimeout = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
        lastError = isTimeout ? `timeout(${timeoutMs}ms)` : err?.message || String(err);
        logger.warn(`[persist] plan=${payload.planId} 第 ${attempts} 次提交异常: ${lastError}`);
      }

      const delay = retryDelaysMs[i];
      if (delay == null) break;
      await sleep(delay);
    }

    return { ok: false, attempts, error: lastError, tookMs: Date.now() - startedAt };
  }

  return { submitPlanDoc, buildPlanDocPayload };
}

/**
 * 新房间/服务重启后读取 DB 快照（P1a 的只读内部端点）。
 * 404 表示从未同步过（回落空文档），其余非 2xx / 网络错误抛错，由房间降级处理。
 */
export function createSnapshotLoader({ appInternalUrl, secret, logger, timeoutMs = 8000, fetchImpl = globalThis.fetch }) {
  const base = String(appInternalUrl).replace(/\/+$/, '');
  return async function loadSnapshot(planId) {
    const url = `${base}/api/internal/plan-doc/${encodeURIComponent(planId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { 'x-collab-secret': secret, accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.status === 404) return { state: null, source: 'empty', revision: 0, lastEventId: 0 };
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GET snapshot HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const body = await res.json();
      const base64State = typeof body?.yjsState === 'string' ? body.yjsState : '';
      const state = base64State ? Buffer.from(base64State, 'base64') : null;
      return {
        state: state && state.length > 0 ? state : null,
        source: state && state.length > 0 ? 'app' : 'empty',
        revision: Number.isFinite(Number(body?.revision)) ? Number(body.revision) : 0,
        lastEventId: Number.isFinite(Number(body?.lastEventId)) ? Number(body.lastEventId) : 0,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
