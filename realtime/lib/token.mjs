/**
 * 协同 token 的签发与校验（P1b 契约，见 docs/plan-p1-collab-spec.md §4 与 docs/realtime-collab.md）。
 *
 *   payload = "<planId>|<userId>|<exp>"          // exp = Unix 秒
 *   token   = "v1." + base64url(payload) + "." + base64url(HMAC_SHA256(COLLAB_SECRET, payload))
 *
 * 兼容两种签名编码：base64url（默认，与 P1a 的 collab-token 端点一致）和 64 位 hex（便于手工 curl 调试）。
 * 校验失败一律返回 { ok: false, reason }，由调用方决定 close 码（服务端固定 4401）。
 */
import crypto from 'node:crypto';

export const TOKEN_PREFIX = 'v1.';
export const DEFAULT_TOKEN_TTL_SECONDS = 300;

const toB64url = (buf) => Buffer.from(buf).toString('base64url');

export function buildTokenPayload({ planId, userId, exp }) {
  return `${planId}|${userId}|${exp}`;
}

export function hmacSha256(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest();
}

export function roomNameForPlan(planId) {
  return `plan-${planId}`;
}

export function parsePlanIdFromRoom(room) {
  const m = /^plan-(\d+)$/.exec(String(room ?? ''));
  if (!m) return null;
  const planId = Number(m[1]);
  return Number.isSafeInteger(planId) && planId > 0 ? planId : null;
}

/**
 * 签发 token（P1a 的 POST .../collab-token 应产出同样的字符串）。
 * @param {{ planId: number|string, userId: number|string, exp?: number }} input
 * @param {string} secret COLLAB_SECRET
 */
export function signCollabToken({ planId, userId, exp }, secret) {
  if (!secret) throw new Error('COLLAB_SECRET 未配置，无法签发协同 token');
  const plan = Number(planId);
  const user = Number(userId);
  if (!Number.isSafeInteger(plan) || plan <= 0) throw new Error(`planId 非法: ${planId}`);
  if (!Number.isSafeInteger(user) || user <= 0) throw new Error(`userId 非法: ${userId}`);
  const expires = Number.isFinite(exp) ? Number(exp) : Math.floor(Date.now() / 1000) + DEFAULT_TOKEN_TTL_SECONDS;
  const payload = buildTokenPayload({ planId: plan, userId: user, exp: expires });
  return `${TOKEN_PREFIX}${toB64url(Buffer.from(payload, 'utf8'))}.${toB64url(hmacSha256(payload, secret))}`;
}

function readSignature(sigPart) {
  if (/^[0-9a-fA-F]{64}$/.test(sigPart)) return Buffer.from(sigPart, 'hex');
  try {
    return Buffer.from(sigPart, 'base64url');
  } catch {
    return null;
  }
}

/**
 * 校验 token。
 * @param {string|undefined} token
 * @param {string} secret
 * @param {{ now?: number, clockSkewSeconds?: number }} [opts]
 * @returns {{ ok: true, planId: number, userId: number, exp: number, room: string } | { ok: false, reason: string }}
 */
export function verifyCollabToken(token, secret, { now = Math.floor(Date.now() / 1000), clockSkewSeconds = 0 } = {}) {
  const fail = (reason) => ({ ok: false, reason });
  if (typeof token !== 'string' || token.trim() === '') return fail('missing_token');
  if (!secret) return fail('server_misconfigured');

  let body = token.trim();
  if (body.startsWith(TOKEN_PREFIX)) body = body.slice(TOKEN_PREFIX.length);

  const parts = body.split('.');
  if (parts.length !== 2) return fail('malformed_token');
  const [payloadPart, sigPart] = parts;
  if (!payloadPart || !sigPart) return fail('malformed_token');

  let payload;
  try {
    payload = Buffer.from(payloadPart, 'base64url').toString('utf8');
  } catch {
    return fail('malformed_payload');
  }
  if (!/^\d+\|\d+\|\d+$/.test(payload)) return fail('malformed_payload');

  const expected = hmacSha256(payload, secret);
  const actual = readSignature(sigPart);
  if (!actual || actual.length !== expected.length) return fail('bad_signature');
  if (!crypto.timingSafeEqual(actual, expected)) return fail('bad_signature');

  const [planIdRaw, userIdRaw, expRaw] = payload.split('|');
  const planId = Number(planIdRaw);
  const userId = Number(userIdRaw);
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(planId) || planId <= 0) return fail('bad_plan_id');
  if (!Number.isSafeInteger(userId) || userId <= 0) return fail('bad_user_id');
  if (exp <= now - Math.max(0, clockSkewSeconds)) return fail('expired');

  return { ok: true, planId, userId, exp, room: roomNameForPlan(planId) };
}
