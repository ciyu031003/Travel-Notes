import { describe, it, expect, afterEach } from 'vitest'
import { GET } from '@/app/api/version/route'

describe('GET /api/version', () => {
  const originalForce = process.env.APP_FORCE_UPDATE

  afterEach(() => {
    if (originalForce === undefined) delete process.env.APP_FORCE_UPDATE
    else process.env.APP_FORCE_UPDATE = originalForce
  })

  it('默认返回非强制更新与完整清单', async () => {
    delete process.env.APP_FORCE_UPDATE
    const res = await GET()
    const body = await res.json()
    expect(body.forceUpdate).toBe(false)
    expect(typeof body.version).toBe('string')
    expect(typeof body.buildNumber).toBe('number')
    expect(body.downloadUrl).toContain('http')
  })

  it('APP_FORCE_UPDATE=1 时返回强制更新', async () => {
    process.env.APP_FORCE_UPDATE = '1'
    const res = await GET()
    const body = await res.json()
    expect(body.forceUpdate).toBe(true)
  })
})
