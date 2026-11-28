import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOKEN_TTL_SECONDS,
  hmacSha256,
  parsePlanIdFromRoom,
  roomNameForPlan,
  signCollabToken,
  verifyCollabToken,
} from '../lib/token.mjs';

const SECRET = 'unit-test-collab-secret';
const NOW = 1_800_000_000;

describe('signCollabToken / verifyCollabToken', () => {
  it('签发的 token 可以通过校验，并带回 planId/userId/exp', () => {
    const token = signCollabToken({ planId: 42, userId: 7, exp: NOW + 300 }, SECRET);
    expect(token.startsWith('v1.')).toBe(true);
    const result = verifyCollabToken(token, SECRET, { now: NOW });
    expect(result).toMatchObject({ ok: true, planId: 42, userId: 7, exp: NOW + 300, room: 'plan-42' });
  });

  it('不传 exp 时使用默认 5 分钟有效期', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signCollabToken({ planId: 1, userId: 2 }, SECRET);
    const result = verifyCollabToken(token, SECRET);
    expect(result.ok).toBe(true);
    expect(result.exp - before).toBeGreaterThanOrEqual(DEFAULT_TOKEN_TTL_SECONDS - 2);
    expect(result.exp - before).toBeLessThanOrEqual(DEFAULT_TOKEN_TTL_SECONDS + 2);
  });

  it('过期 token 被拒绝（并支持时钟偏移）', () => {
    const token = signCollabToken({ planId: 42, userId: 7, exp: NOW - 1 }, SECRET);
    expect(verifyCollabToken(token, SECRET, { now: NOW })).toMatchObject({ ok: false, reason: 'expired' });
    expect(verifyCollabToken(token, SECRET, { now: NOW, clockSkewSeconds: 60 }).ok).toBe(true);
  });

  it('错误密钥 / 被篡改的 payload 被拒绝', () => {
    const token = signCollabToken({ planId: 42, userId: 7, exp: NOW + 300 }, SECRET);
    expect(verifyCollabToken(token, 'other-secret', { now: NOW })).toMatchObject({ ok: false, reason: 'bad_signature' });

    const [, payloadPart, sigPart] = token.split('.');
    const forgedPayload = Buffer.from('42|999|' + (NOW + 300)).toString('base64url');
    const forged = `v1.${forgedPayload}.${sigPart}`;
    expect(verifyCollabToken(forged, SECRET, { now: NOW })).toMatchObject({ ok: false, reason: 'bad_signature' });
    // 保持 payload 不变但签名错误
    expect(verifyCollabToken(`v1.${payloadPart}.${sigPart}x`, SECRET, { now: NOW }).ok).toBe(false);
  });

  it('兼容 hex 签名（便于手工调试）', () => {
    const payload = `42|7|${NOW + 300}`;
    const token = `v1.${Buffer.from(payload).toString('base64url')}.${hmacSha256(payload, SECRET).toString('hex')}`;
    expect(verifyCollabToken(token, SECRET, { now: NOW })).toMatchObject({ ok: true, planId: 42, userId: 7 });
  });

  it('缺失/畸形 token 被拒绝', () => {
    expect(verifyCollabToken(undefined, SECRET)).toMatchObject({ ok: false, reason: 'missing_token' });
    expect(verifyCollabToken('', SECRET)).toMatchObject({ ok: false, reason: 'missing_token' });
    expect(verifyCollabToken('not-a-token', SECRET)).toMatchObject({ ok: false, reason: 'malformed_token' });
    expect(verifyCollabToken('v1.abc', SECRET)).toMatchObject({ ok: false, reason: 'malformed_token' });
    expect(verifyCollabToken('v1.' + Buffer.from('42|x|1').toString('base64url') + '.abc', SECRET)).toMatchObject({
      ok: false,
      reason: 'malformed_payload',
    });
  });

  it('服务端未配置密钥时拒绝校验', () => {
    expect(verifyCollabToken('v1.abc.def', '')).toMatchObject({ ok: false, reason: 'server_misconfigured' });
  });

  it('planId/userId 必须是正整数', () => {
    expect(() => signCollabToken({ planId: 0, userId: 1 }, SECRET)).toThrow(/planId 非法/);
    expect(() => signCollabToken({ planId: 1, userId: -3 }, SECRET)).toThrow(/userId 非法/);
    // 伪造 0 值 payload 即使签名正确也拒绝
    const payload = `0|7|${NOW + 300}`;
    const token = `v1.${Buffer.from(payload).toString('base64url')}.${hmacSha256(payload, SECRET).toString('base64url')}`;
    expect(verifyCollabToken(token, SECRET, { now: NOW })).toMatchObject({ ok: false, reason: 'bad_plan_id' });
  });

  it('room 名工具函数与 token 一致', () => {
    expect(roomNameForPlan(42)).toBe('plan-42');
    expect(parsePlanIdFromRoom('plan-42')).toBe(42);
    expect(parsePlanIdFromRoom('plan-0')).toBeNull();
    expect(parsePlanIdFromRoom('plan-abc')).toBeNull();
    expect(parsePlanIdFromRoom(undefined)).toBeNull();
  });

  it('与 P1a 的 HMAC(planId|userId|exp) 约定一致（可直接手工复算）', () => {
    const payload = `42|7|${NOW + 300}`;
    const expected = `v1.${Buffer.from(payload).toString('base64url')}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
    expect(signCollabToken({ planId: 42, userId: 7, exp: NOW + 300 }, SECRET)).toBe(expected);
  });
});
