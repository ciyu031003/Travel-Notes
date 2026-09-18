#!/usr/bin/env node
/**
 * 生产实测：「我的」页重构（R1）。
 *
 * 为什么必须到生产上跑一遍：本轮的改动横跨
 *   ① 统计口径（服务端 SQL 从 Post 换成 Travel）
 *   ② 新列 User.coverUrl / coverFocusX / coverFocusY（**生产库必须已迁移**）
 *   ③ 头图上传（真实写磁盘 + sharp 生成三个变体 + 旧图清理）
 * 这三条里任何一条只在真实环境才暴露：列没迁就 500、磁盘不可写就上传失败、
 * nginx 没配 /uploads/covers 就图裂。
 *
 * 用法：node scripts/verify-prod-me.cjs
 * 可选：PROD_BASE / PROD_USER / PROD_PASS
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'
const STAMP = String(Date.now()).slice(-8)
// 注意用户名上限 20 位（RegisterSchema min2/max20）
const USER = process.env.PROD_USER || `pm${STAMP}`
const PASS = process.env.PROD_PASS || 'ProbeRunner2026!'

/** 1x1 JPEG：最小合法图片；再靠一张"横向纯色图"验证 sharp 变体与 object-position */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

const steps = []
function ok(name, extra = '') {
  steps.push(['✓', name])
  console.log('✓', name, extra)
}
function fail(name, err) {
  steps.push(['✗', name, String(err)])
  console.error('✗', name, err instanceof Error ? err.message : err)
}

async function tap(page, text) {
  const arg = text instanceof RegExp ? { source: text.source, flags: text.flags } : text
  const hit = await page.evaluate((t) => {
    const re = typeof t === 'string' ? null : new RegExp(t.source, t.flags)
    const needle = typeof t === 'string' ? t : ''
    const all = Array.from(document.querySelectorAll('button,a'))
    const matches = all.filter((b) => {
      const s = (b.textContent || '').trim()
      const label = (b.getAttribute('aria-label') || '').trim()
      return re ? re.test(s) || re.test(label) : s.includes(needle) || label === needle
    })
    const el = matches[matches.length - 1]
    if (!el) return false
    el.click()
    return true
  }, arg)
  if (!hit) throw new Error(`未找到可点击元素：${text}`)
}

/** 等「我的」页真正渲染出档案（有用户名 @xxx 才算数据到位，否则只是 AsyncState 骨架） */
async function waitMeLoaded(page) {
  await page.locator('text=/^@/').first().waitFor({ timeout: 40_000 })
}

/** 读页面上的三统计 */
async function readStats(page) {
  return page.evaluate(() => {
    const text = document.body.innerText
    const pick = (label) => {
      const m = text.match(new RegExp('(\\d+)\\s*\\n?\\s*' + label))
      return m ? Number(m[1]) : -1
    }
    return { travels: pick('次旅行'), places: pick('个地方'), photos: pick('张照片') }
  })
}

/** 直接读接口口径（用于和页面显示对账） */
async function apiStats(ctx) {
  const me = (await (await ctx.request.get(`${BASE}/api/me`)).json()).data
  return { travels: me.summary.travelCount, places: me.summary.placeCount, photos: me.summary.photoCount }
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const apiErrors = []
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })

  let travelId = null
  try {
    // ── 0. 账号
    let loggedIn = false
    if (!process.env.PROD_USER) {
      const reg = await ctx.request.post(`${BASE}/api/register`, {
        data: { username: USER, password: PASS, rememberMe: true, clientType: 'web' },
      })
      loggedIn = reg.ok()
      ok('注册一次性账号', `http=${reg.status()}`)
    }
    if (!loggedIn) {
      const login = await ctx.request.post(`${BASE}/api/login`, {
        data: { username: USER, password: PASS, rememberMe: true, clientType: 'web' },
      })
      if (!login.ok()) throw new Error(`登录失败 http=${login.status()}`)
      ok('登录', `http=${login.status()}`)
    }

    // 清掉上次中断留下的探测数据
    const listRes = await ctx.request.get(`${BASE}/api/travels`)
    const listJson = await listRes.json().catch(() => ({}))
    const leftovers = (listJson?.posts || []).filter((p) => String(p?.title || '').startsWith('ME-PROBE'))
    for (const p of leftovers) await ctx.request.delete(`${BASE}/api/admin/travels/${p.id}`).catch(() => null)
    if (leftovers.length) ok('清理历史探测旅行', `${leftovers.length} 本`)

    // ── 1. 迁移是否生效：/api/me 能返回 cover 字段
    const meRes = await ctx.request.get(`${BASE}/api/me`)
    if (!meRes.ok()) throw new Error(`/api/me → ${meRes.status()}（生产库是否已跑 migrate-r1-profile-cover.cjs？）`)
    const me = (await meRes.json()).data
    if (!('coverUrl' in me) || !('coverFocusX' in me) || !('coverFocusY' in me)) {
      throw new Error('生产 /api/me 未返回 coverUrl/coverFocusX/coverFocusY —— 迁移未生效或部署未更新')
    }
    ok('生产 /api/me 已带 cover 字段（迁移生效）')

    // ── 2. 打开「我的」页，读基准统计
    await page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitMeLoaded(page)
    const before = await readStats(page)
    // 页面显示必须与接口口径一致（否则说明前端渲染或取数有一处不对）
    const beforeApi = await apiStats(ctx)
    if (before.travels !== beforeApi.travels || before.places !== beforeApi.places || before.photos !== beforeApi.photos) {
      throw new Error(`页面统计与 /api/me 不一致：页面=${JSON.stringify(before)} 接口=${JSON.stringify(beforeApi)}`)
    }
    ok('打开「我的」页（页面与接口口径一致）', `旅行=${before.travels} 地方=${before.places} 照片=${before.photos}`)

    // 页面结构：不再有旅行故事；记录/设置入口在位
    const body = await page.locator('body').innerText()
    if (body.includes('我的旅行故事')) throw new Error('页面上仍有「我的旅行故事」')
    for (const must of ['时间线', '碎碎念', '数据看板', '数据与同步']) {
      if (!body.includes(must)) throw new Error(`缺少入口：${must}`)
    }
    ok('页面结构正确（无旅行故事，记录/设置入口齐全）')

    // ── 3. 建一本旅行 → 统计 +1（口径修复的核心）
    const title = `ME-PROBE-${STAMP}`
    const createRes = await ctx.request.post(`${BASE}/api/admin/travels`, {
      data: { title, location: 'Hangzhou', startDate: '2026-10-01', endDate: '2026-10-03' },
    })
    const created = await createRes.json().catch(() => ({}))
    if (!createRes.ok()) throw new Error(`建旅行失败 http=${createRes.status()} ${JSON.stringify(created)}`)
    travelId = created.id
    ok('建一本旅行（Hangzhou 3 天）', `id=${travelId}`)

    // ① 接口口径（这是修复的核心：Travel 表而不是 Post 表）
    let afterApi = beforeApi
    for (let i = 0; i < 10; i++) {
      afterApi = await apiStats(ctx)
      if (afterApi.travels === beforeApi.travels + 1) break
      await page.waitForTimeout(500)
    }
    if (afterApi.travels !== beforeApi.travels + 1) {
      throw new Error(`/api/me 统计未 +1：before=${beforeApi.travels} after=${afterApi.travels}（口径修复是否部署？）`)
    }
    if (afterApi.places < beforeApi.places) throw new Error(`地方数不应减少：${beforeApi.places} → ${afterApi.places}`)
    ok('接口统计立刻 +1（口径修复生效）', `旅行 ${beforeApi.travels}→${afterApi.travels}，地方 ${beforeApi.places}→${afterApi.places}`)

    // ② 页面也要跟着变（刷新一次，等档案渲染完成再读）
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitMeLoaded(page)
    let after = before
    for (let i = 0; i < 20; i++) {
      after = await readStats(page)
      if (after.travels === before.travels + 1) break
      await page.waitForTimeout(600)
    }
    if (after.travels !== before.travels + 1) {
      throw new Error(`页面统计未 +1：before=${before.travels} after=${after.travels}（前端渲染是否用了新字段？）`)
    }
    ok('页面统计跟着 +1', `旅行 ${before.travels}→${after.travels}`)

    // ── 4. 上传头图 → 立即可见（含 sharp 变体与磁盘写入）
    await page.getByLabel('选择头图图片').setInputFiles({
      name: 'cover.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    })
    const cover = page.getByTestId('profile-cover')
    await cover.waitFor({ timeout: 40_000 })
    const src = (await cover.getAttribute('src')) || ''
    if (!src.includes('/uploads/covers/')) throw new Error(`头图 URL 异常：${src}`)
    ok('头图上传成功', src)

    // 三个变体都要能取到（主图 + preview + blur），否则缓存/nginx 配置有问题
    for (const [label, url] of [
      ['主图', src],
      ['preview', src.replace('.webp', '-preview.webp')],
      ['blur', src.replace('.webp', '-blur.jpg')],
    ]) {
      const r = await ctx.request.get(url.startsWith('http') ? url : `${BASE}${url}`)
      if (!r.ok()) throw new Error(`变体 ${label} 不可访问 http=${r.status()} ${url}`)
      ok(`头图变体可访问：${label}`)
    }

    // ── 5. 焦点九宫格 → object-position 落库并在刷新后保持
    await tap(page, '更换头图')
    const dialog = page.getByRole('dialog', { name: '档案头图' })
    await dialog.waitFor({ timeout: 20_000 })
    await dialog.getByRole('button', { name: '焦点 第1行 第1列' }).click()
    await page.waitForTimeout(1200)
    const style = (await cover.getAttribute('style')) || ''
    if (!style.includes('object-position')) throw new Error(`焦点未写入 object-position：${style}`)
    ok('焦点写入 object-position', style)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitMeLoaded(page)
    const styleAfter = (await page.getByTestId('profile-cover').getAttribute('style')) || ''
    if (!styleAfter.includes('41.67%')) throw new Error(`刷新后焦点丢失或不是所选格：${styleAfter}`)
    ok('刷新后焦点保持（已落库）', styleAfter)

    // 服务端也要真的存了焦点（不只靠前端 state）
    const me2 = (await (await ctx.request.get(`${BASE}/api/me`)).json()).data
    if (me2.coverFocusX == null || me2.coverFocusY == null) throw new Error('服务端 coverFocus 为空')
    ok('服务端已保存 focus', `x=${me2.coverFocusX} y=${me2.coverFocusY}`)

    if (apiErrors.length) {
      console.log('\n⚠ 期间出现过的 4xx/5xx 接口响应：')
      for (const e of apiErrors) console.log('  ', e)
    } else {
      console.log('\n（全程无 4xx/5xx 接口响应）')
    }

    // 清理：删掉探测旅行（头图留在该一次性账号上，账号本身也是探测产物）
    if (travelId) await ctx.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
    ok('清理探测数据')

    console.log('\n生产实测通过（「我的」页 R1）')
    await browser.close()
    process.exit(0)
  } catch (e) {
    fail('生产实测失败', e)
    await page.screenshot({ path: '.prod-me-fail.png', fullPage: false }).catch(() => null)
    console.error('（已保存截图 .prod-me-fail.png）')
    if (travelId) await ctx.request.delete(`${BASE}/api/admin/travels/${travelId}`).catch(() => null)
    await browser.close()
    process.exit(1)
  }
}

main()
