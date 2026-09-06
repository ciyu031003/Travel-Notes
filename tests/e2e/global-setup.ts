import { chromium, type FullConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * E2E 全局 setup：
 * 1. 注册专用账号 e2e_runner（已存在则忽略报错）。
 * 2. API 登录拿 HttpOnly 会话 cookie，写成 storageState 供各用例复用。
 * 3. 预热 dev 首编（逐页预请求，避免用例互相等待冷编译）。
 */
const BASE = 'http://localhost:3111'
export const E2E_USER = { username: 'e2e_runner', password: 'E2eRunner2026!' }

const WARM_PAGES = [
  '/', '/travel', '/timeline', '/moments', '/circle', '/me', '/dashboard', '/sync', '/album',
]

export default async function globalSetup(_config: FullConfig) {
  // 1. 注册（存在即失败，忽略）
  await fetch(`${BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...E2E_USER, rememberMe: true, clientType: 'web' }),
  }).catch(() => null)

  // 2. 登录并写 storageState
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...E2E_USER, rememberMe: true, clientType: 'web' }),
  })
  if (!res.ok) throw new Error(`[e2e-setup] 登录失败: ${res.status}`)
  const cookies = res.headers.getSetCookie()
  const session = cookies.map((c) => c.split('=')[0] === 'admin_session' ? c : null).filter(Boolean)[0]
  if (!session) throw new Error('[e2e-setup] 未收到 admin_session cookie')
  const value = session.split(';')[0].slice('admin_session='.length)

  const authDir = path.join(__dirname, '.auth')
  fs.mkdirSync(authDir, { recursive: true })
  fs.writeFileSync(
    path.join(authDir, 'state.json'),
    JSON.stringify({
      cookies: [
        { name: 'admin_session', value, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
      ],
      origins: [],
    }),
  )

  // 3. 预热（带 cookie 预请求核心页，触发 dev 首编）
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  for (const p of WARM_PAGES) {
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null)
    await page.waitForTimeout(300)
  }
  await browser.close()
}
