/**
 * 客户端错误上报服务（P-07 后半，1.29.0）。
 *
 * 背景：评审之前线上 JS 白屏/报错"只能靠用户截图猜"（多次复盘的原话）。
 * 自建轻量通道（不引入 Sentry 等外部依赖/账号）：客户端把 error /
 * unhandledrejection / React 边界捕获的异常 POST 到
 * /api/diagnostics/client-error，落 ClientErrorLog 表，站主在
 * /api/admin/diagnostics/client-errors 查询。
 *
 * 边界（刻意如此）：
 *  · 只做**诊断记录**，不做聚合/告警——量与噪音靠客户端去重（同 message
 *    每会话只报一次）+ IP 限流约束；
 *  · 字段全部有界：message/stack/url 在 zod（服务端）与截断（客户端）双保险，
 *    异常对象可能包含任意内容，绝不能原样入库；
 *  · 匿名可报（登录前也会崩）：userId 由服务端从会话补齐，请求体不携带。
 */
import { prisma } from '@/lib/db'

export const CLIENT_ERROR_KINDS = ['js-error', 'unhandled-rejection', 'react-boundary'] as const
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number]

export interface ClientErrorInput {
  kind: ClientErrorKind
  message: string
  stack?: string
  url?: string
  appVersion?: string
  buildNumber?: number
  platform?: string
  userId?: number | null
}

const MAX_MESSAGE = 500
const MAX_STACK = 4000
const MAX_URL = 300
const MAX_VERSION = 20
const MAX_PLATFORM = 10

function truncate(v: string | undefined | null, max: number): string | null {
  if (!v) return null
  return v.length > max ? v.slice(0, max) : v
}

export async function recordClientError(input: ClientErrorInput): Promise<{ id: number }> {
  const row = await prisma.clientErrorLog.create({
    data: {
      kind: input.kind,
      message: truncate(input.message, MAX_MESSAGE) ?? 'unknown',
      stack: truncate(input.stack, MAX_STACK),
      url: truncate(input.url, MAX_URL),
      appVersion: truncate(input.appVersion, MAX_VERSION),
      buildNumber: typeof input.buildNumber === 'number' && Number.isFinite(input.buildNumber) ? Math.trunc(input.buildNumber) : null,
      platform: truncate(input.platform, MAX_PLATFORM),
      userId: input.userId ?? null,
    },
    select: { id: true },
  })
  return row
}

export interface ListClientErrorsOptions {
  kind?: string
  /** 游标：返回 id 更小（更早）的记录 */
  before?: number
  limit?: number
}

export async function listClientErrors(options: ListClientErrorsOptions) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  return prisma.clientErrorLog.findMany({
    where: {
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.before ? { id: { lt: options.before } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit,
    select: {
      id: true,
      kind: true,
      message: true,
      stack: true,
      url: true,
      appVersion: true,
      buildNumber: true,
      platform: true,
      userId: true,
      createdAt: true,
    },
  })
}
