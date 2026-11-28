/**
 * 环境变量解析 + 启动期校验。
 * 所有可调参数集中在这里，server.mjs 只读 config 对象（便于单测注入）。
 */
import crypto from 'node:crypto';

export const DEV_FALLBACK_SECRET = 'dev-collab-secret';
export const DEFAULT_TOKEN_TTL_SECONDS = 300;

function readInt(env, key, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[key];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) throw new Error(`环境变量 ${key} 不是数字: ${raw}`);
  const value = Math.trunc(n);
  if (value < min || value > max) throw new Error(`环境变量 ${key} 超出范围 [${min}, ${max}]: ${raw}`);
  return value;
}

function readDelays(env, key, fallback) {
  const raw = env[key];
  if (raw == null || String(raw).trim() === '') return fallback;
  const list = String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const n = Number(part);
      if (!Number.isFinite(n) || n < 0) throw new Error(`环境变量 ${key} 含非法毫秒值: ${part}`);
      return Math.trunc(n);
    });
  return list.length > 0 ? list : fallback;
}

/**
 * @param {Record<string, string|undefined>} env
 */
export function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const rawSecret = String(env.COLLAB_SECRET ?? '').trim();
  const secret = rawSecret || (isProduction ? '' : DEV_FALLBACK_SECRET);
  const warnings = [];

  if (!secret) {
    throw new Error(
      'COLLAB_SECRET 未配置：生产环境必须显式设置（与 app 侧签发 collab-token 的密钥相同）。' +
        '本地开发可省略，会回落到 dev-collab-secret（app 侧非 production 同款回落值）。',
    );
  }
  if (isProduction && secret.length < 16) {
    warnings.push('COLLAB_SECRET 长度小于 16 字符，建议使用 openssl rand -hex 32 生成');
  }
  if (!isProduction && secret === DEV_FALLBACK_SECRET) {
    warnings.push('正在使用本地开发回落密钥 dev-collab-secret，禁止用于生产');
  }

  const appInternalUrlRaw = String(env.APP_INTERNAL_URL ?? '').trim() || 'http://127.0.0.1:3000';
  let appInternalUrl;
  try {
    appInternalUrl = new URL(appInternalUrlRaw).toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`APP_INTERNAL_URL 不是合法 URL: ${appInternalUrlRaw}`);
  }

  const config = {
    isProduction,
    serviceName: 'travel-notes-realtime',
    /** 服务实例 ID，随每次快照回传给 app，便于日志排查是哪个 realtime 实例写的 */
    instanceId: crypto.randomUUID(),
    port: readInt(env, 'PORT', 1234, { min: 1, max: 65535 }),
    host: String(env.HOST ?? '').trim() || '0.0.0.0',
    secret,
    /** app 内部回传/读取端点基址（docker: http://app:3000；本地: http://127.0.0.1:3000） */
    appInternalUrl,
    /** 文档变更聚合窗口：默认 800ms 防抖（契约 §4） */
    saveDebounceMs: readInt(env, 'COLLAB_SAVE_DEBOUNCE_MS', 800, { min: 50, max: 60000 }),
    /** presence（连接/断开）落库的防抖窗口，比文档变更慢，避免光标抖动写库 */
    presenceSaveDebounceMs: readInt(env, 'COLLAB_PRESENCE_SAVE_DEBOUNCE_MS', 1200, { min: 100, max: 120000 }),
    /** POST 失败后的重试间隔（数组长度 = 重试次数；默认 3 次重试） */
    saveRetryDelaysMs: readDelays(env, 'COLLAB_SAVE_RETRY_DELAYS_MS', [250, 500, 1000]),
    /** 单次 HTTP 超时 */
    saveTimeoutMs: readInt(env, 'COLLAB_SAVE_TIMEOUT_MS', 8000, { min: 500, max: 120000 }),
    /** 保存最终失败后，房间仍活着时的再试间隔 */
    saveRetryLaterMs: readInt(env, 'COLLAB_SAVE_RETRY_LATER_MS', 5000, { min: 500, max: 300000 }),
    /** 房间空置多久后从内存卸载（卸载前会再 flush 一次） */
    roomIdleTtlMs: readInt(env, 'COLLAB_ROOM_IDLE_TTL_MS', 30 * 60 * 1000, { min: 1000, max: 24 * 60 * 60 * 1000 }),
    /** token exp 允许的时钟偏移（秒） */
    clockSkewSeconds: readInt(env, 'COLLAB_CLOCK_SKEW_SECONDS', 30, { min: 0, max: 3600 }),
    /** WebSocket 心跳（保持 nginx/中间层长连接不被空闲断开） */
    pingIntervalMs: readInt(env, 'COLLAB_PING_INTERVAL_MS', 25000, { min: 5000, max: 300000 }),
    /** 单帧最大字节数（Yjs update 一般远小于此值） */
    maxPayloadBytes: readInt(env, 'COLLAB_MAX_PAYLOAD_BYTES', 4 * 1024 * 1024, { min: 1024, max: 64 * 1024 * 1024 }),
    logLevel: String(env.COLLAB_LOG_LEVEL ?? '').trim() || 'info',
    warnings,
  };

  if (!isProduction && config.appInternalUrl.includes('://127.0.0.1') === false && config.appInternalUrl.includes('localhost') === false) {
    // 仅提示：本地联调时通常指向 dev server
    config.warnings.push(`APP_INTERNAL_URL 指向 ${config.appInternalUrl}，本地联调通常应为 http://127.0.0.1:3000 或 http://localhost:3000`);
  }

  return config;
}
