/** 从 Request 中提取客户端 IP（兼容反向代理转发头） */
export function getClientIp(request: Request | { headers: Headers }): string | null {
  const headers = request.headers
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return headers.get('x-real-ip')
}

/** 从 Request 中提取 User-Agent（截断长度） */
export function getUserAgent(request: Request | { headers: Headers }, maxLen = 500): string | null {
  const ua = request.headers.get('user-agent')
  if (!ua) return null
  return ua.slice(0, maxLen)
}
