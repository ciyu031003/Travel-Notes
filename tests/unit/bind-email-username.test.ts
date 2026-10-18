import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * P0-3：bind-email 必须把「当前登录用户名」传给 siteService.updateEmail。
 * 旧实现不传 username → service 回退首个用户（站长），任意登录用户可把邮箱绑到站长账号，
 * 再走忘记密码改掉站长密码（账号接管链）。
 */
const { requireAuthMock, updateEmailMock, verifyCodeMock, consumeCodeMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  updateEmailMock: vi.fn(),
  verifyCodeMock: vi.fn(),
  consumeCodeMock: vi.fn(),
}))

vi.mock('@/lib/auth-middleware', () => ({ requireAuth: requireAuthMock }))
vi.mock('@/lib/container', () => ({ getSiteService: () => ({ updateEmail: updateEmailMock }) }))
vi.mock('@/lib/verification', () => ({
  verifyVerificationCode: verifyCodeMock,
  consumeVerificationCode: consumeCodeMock,
}))

import { POST } from '@/app/api/admin/settings/bind-email/route'

function bindRequest(body: Record<string, unknown>) {
  return new Request('http://example.com/api/admin/settings/bind-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuthMock.mockResolvedValue({ authenticated: true, username: 'alice', payload: { userId: 2, username: 'alice' } })
  verifyCodeMock.mockResolvedValue(true)
  consumeCodeMock.mockResolvedValue(undefined)
  updateEmailMock.mockResolvedValue({ success: true })
})

describe('bind-email 按当前登录用户定位（P0-3）', () => {
  it('把 authResult.username 传给 updateEmail（不是首用户）', async () => {
    const res = await POST(bindRequest({ email: 'alice@example.com', code: '123456' }))
    expect(res.status).toBe(200)
    expect(updateEmailMock).toHaveBeenCalledWith('alice@example.com', undefined, true, 'alice')
  })

  it('service 返回失败（用户不存在/缺少标识）→ 401，不假装成功', async () => {
    updateEmailMock.mockResolvedValue({ success: false, error: '缺少用户标识，请重新登录' })
    const res = await POST(bindRequest({ email: 'alice@example.com', code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('未登录 → 401 且不调用 service', async () => {
    requireAuthMock.mockResolvedValue({ authenticated: false, status: 401 })
    const res = await POST(bindRequest({ email: 'alice@example.com', code: '123456' }))
    expect(res.status).toBe(401)
    expect(updateEmailMock).not.toHaveBeenCalled()
  })
})
