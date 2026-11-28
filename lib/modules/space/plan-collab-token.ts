/**
 * 协同鉴权：collab-token 签发/校验 + 内部端点共享密钥校验（P1a）。
 *
 * 契约（与 realtime 服务对齐，docs/plan-p1-collab-spec.md §4）：
 *   payload = `${planId}|${userId}|${exp}`      exp = Unix 秒
 *   token   = `v1.${base64url(payload)}.${base64url(HMAC_SHA256(COLLAB_SECRET, payload))}`
 *   —— base64url **无 padding**；有效期 5 分钟（300s）。
 *
 * 密钥：优先 process.env.COLLAB_SECRET；未设置时仅在非生产环境回落 'dev-collab-secret'
 * （方便本地联调），生产环境缺失 → 直接拒绝签发/校验，绝不静默放行。
 */
import { createHmac, timingSafeEqual } from 'crypto'

export const COLLAB_TOKEN_TTL_SECONDS = 300
export const COLLAB_TOKEN_VERSION = 'v1'
const DEV_FALLBACK_SECRET = 'dev-collab-secret'

/** 取共享密钥；生产环境未配置时返回 null（调用方按 500/403 处理） */
export function getCollabSecret(): string | null {
  const fromEnv = process.env.COLLAB_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production') return null
  return DEV_FALLBACK_SECRET
}

function base64Url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

export interface CollabTokenPayload {
  planId: number
  userId: number
  exp: number
}

/** 常量时间比较字符串（长度不同直接 false，不泄露长度信息） */
export function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export interface IssueCollabTokenInput {
  planId: number
  userId: number
  /** Unix 秒；缺省 now/1000 + 300 */
  exp?: number
  secret?: string | null
  /** 便于单测注入当前时间（毫秒） */
  nowMs?: number
}

export interface IssuedCollabToken extends CollabTokenPayload {
  token: string
  expiresIn: number
}

/** 签发 5 分钟有效的协同 token（HMAC-SHA256） */
export function issueCollabToken(input: IssueCollabTokenInput): IssuedCollabToken {
  const secret = input.secret ?? getCollabSecret()
  if (!secret) throw new Error('协同密钥未配置（COLLAB_SECRET）')
  const nowMs = input.nowMs ?? Date.now()
  const exp = input.exp ?? Math.floor(nowMs / 1000) + COLLAB_TOKEN_TTL_SECONDS
  const payload = `${input.planId}|${input.userId}|${exp}`
  const signature = createHmac('sha256', secret).update(payload).digest()
  return {
    planId: input.planId,
    userId: input.userId,
    exp,
    token: `${COLLAB_TOKEN_VERSION}.${base64Url(payload)}.${base64Url(signature)}`,
    expiresIn: Math.max(0, exp - Math.floor(nowMs / 1000)),
  }
}

export type CollabTokenVerifyResult =
  | { ok: true; payload: CollabTokenPayload }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'secret-missing' }

/**
 * 校验协同 token（实时服务侧同逻辑，可 import 复用）。
 * planId 传了则额外校验「token 是给这个计划的」。
 */
export function verifyCollabToken(
  token: string,
  options: { secret?: string | null; planId?: number; nowMs?: number } = {},
): CollabTokenVerifyResult {
  const secret = options.secret ?? getCollabSecret()
  if (!secret) return { ok: false, reason: 'secret-missing' }
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3 || parts[0] !== COLLAB_TOKEN_VERSION) return { ok: false, reason: 'malformed' }
  const [, encodedPayload, encodedSignature] = parts
  let payloadText: string
  try {
    payloadText = fromBase64Url(encodedPayload).toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const match = /^(\d+)\|(\d+)\|(\d+)$/.exec(payloadText)
  if (!match) return { ok: false, reason: 'malformed' }
  const expected = createHmac('sha256', secret).update(payloadText).digest()
  let actual: Buffer
  try {
    actual = fromBase64Url(encodedSignature)
  } catch {
    return { ok: false, reason: 'signature' }
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'signature' }
  }
  const planId = Number(match[1])
  const userId = Number(match[2])
  const exp = Number(match[3])
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000)
  if (exp <= nowSeconds) return { ok: false, reason: 'expired' }
  if (options.planId != null && options.planId !== planId) return { ok: false, reason: 'signature' }
  return { ok: true, payload: { planId, userId, exp } }
}

/** 内部端点：校验 x-collab-secret（常量时间比较） */
export function isCollabSecretValid(headerValue: string | null | undefined): boolean {
  const secret = getCollabSecret()
  if (!secret) return false
  const value = String(headerValue ?? '')
  if (!value) return false
  return safeEqualText(value, secret)
}

/** 实时服务连接地址（WebSocket）：env COLLAB_WS_URL，默认本地 1234/collab */
export function getCollabWsUrl(): string {
  const fromEnv = process.env.COLLAB_WS_URL?.trim()
  return fromEnv || 'ws://localhost:1234/collab'
}
