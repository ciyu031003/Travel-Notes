/**
 * HTTP 缓存头助手（阶段 A · A1）。
 *
 * 背景：本项目读接口全部 force-dynamic 且未设置 Cache-Control（Next 默认 no-store），
 * 浏览器/CDN 零缓存，每次访问都打到 DB。这里给读接口补上分级缓存头：
 *
 * - scope 'public'  ：公开内容（RSS 等）→ 浏览器 + CDN 都可缓存。
 * - scope 'user'    ：按登录用户过滤的内容（自己的 + 公开的）→
 *   未登录时响应为「公开子集」，可公开缓存；登录后为个性化响应 → private，
 *   并附加 Vary: Cookie 防止共享缓存把匿名响应串给登录用户（反之亦然）。
 * - scope 'private' ：私人内容（如带锁相册）→ 仅浏览器缓存，绝不进共享缓存。
 *
 * 注意：这里只影响读接口；写接口 / admin 接口不加缓存，保持实时。
 */
import type { NextResponse } from 'next/server'

export type CacheScope = 'public' | 'user' | 'private'

export interface CacheControlOptions {
  /** 浏览器 max-age（秒） */
  maxAge?: number
  /** 共享缓存 s-maxage（秒，public 生效） */
  sMaxAge?: number
  /** stale-while-revalidate（秒） */
  swr?: number
}

export function cacheControlHeader(
  scope: CacheScope,
  loggedIn: boolean,
  opts: CacheControlOptions = {},
): string {
  const maxAge = opts.maxAge ?? 30
  const sMaxAge = opts.sMaxAge ?? 60
  const swr = opts.swr ?? (scope === 'public' ? 300 : maxAge)

  if (scope === 'private') {
    return `private, max-age=${maxAge}, stale-while-revalidate=${swr}`
  }
  if (scope === 'user' && loggedIn) {
    return `private, max-age=${maxAge}, stale-while-revalidate=${swr}`
  }
  // public，或未登录时的 user 范围（响应仅为公开子集）
  return `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
}

/** 设置缓存头；user 范围额外附加 Vary: Cookie（合并已有 Vary，避免覆盖 CORS 的 Vary: Origin） */
export function applyCacheControl(
  response: NextResponse,
  scope: CacheScope,
  loggedIn: boolean,
  opts?: CacheControlOptions,
): NextResponse {
  response.headers.set('Cache-Control', cacheControlHeader(scope, loggedIn, opts))
  if (scope === 'user') {
    const existing = response.headers.get('vary')
    response.headers.set('Vary', existing ? `${existing}, Cookie` : 'Cookie')
  }
  return response
}
