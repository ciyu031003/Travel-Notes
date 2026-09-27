/**
 * 端到端验证（真实 HTTP）：**个人旅行**能否被创建者删除。
 *
 * 对应真机反馈：「点开进行中的旅行 → 右上角三个点 → 删除 → 提示删除失败」。
 * 根因：DELETE /api/travels/[id] → space-travel.service 一律 requireSpaceRole，
 * 而个人旅行 spaceId=NULL 永远找不到空间成员 → 被判「无权访问该空间」。
 *
 * 本脚本走的就是客户端那条路：
 *   注册/登录 → POST /api/admin/travels 建个人旅行 → GET 详情(200)
 *   → DELETE /api/travels/<id> → 必须 200 → 再 GET 详情必须 404
 *   并额外验证：他人删除必须失败（不能因为修好个人旅行就把越权也放开）
 *
 * 用法：先 npm run dev，再 node scripts/verify-travel-delete.cjs
 */
const BASE = process.env.TN_BASE || 'http://localhost:3000'

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON */ }
  return { status: res.status, json, text, setCookie: res.headers.getSetCookie?.() ?? [] }
}

async function login(username, password) {
  await api('/api/register', { method: 'POST', body: { username, password } })
  const r = await api('/api/login', { method: 'POST', body: { username, password } })
  if (r.status !== 200) throw new Error(`登录失败 ${username}: ${r.status}`)
  const cookie = (r.setCookie || []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('未拿到会话 cookie')
  return cookie
}

const out = []
function check(name, ok, detail = '') {
  out.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`)
}

const s = Date.now()

;(async () => {
  const owner = await login(`vdel${s}`, 'Verify2026!x')
  const other = await login(`vdelo${s}`, 'Verify2026!x')

  // 建一本**个人**旅行（不带 spaceId）
  const created = await api('/api/admin/travels', {
    method: 'POST', cookie: owner,
    body: { title: `待删除旅行${s}`, location: '丽江', startDate: '2026-12-01', endDate: '2026-12-03' },
  })
  check('创建个人旅行', created.status === 201, `status=${created.status}`)
  const id = created.json?.id
  const slug = created.json?.slug
  if (!id) throw new Error('未拿到 id')

  const detail = await api(`/api/travels/by-slug/${encodeURIComponent(slug)}/detail`, { cookie: owner })
  check('详情可读（说明它确实是个人旅行）', detail.status === 200, `status=${detail.status}`)
  check('详情确认 spaceId 为空', detail.json?.travel?.spaceId === null, `spaceId=${detail.json?.travel?.spaceId}`)

  // 他人删除必须被拒（不能因为修好个人旅行就放开越权）
  const otherDel = await api(`/api/travels/${id}`, { method: 'DELETE', cookie: other })
  check('他人删除被拒绝', otherDel.status === 400 || otherDel.status === 403, `status=${otherDel.status} ${otherDel.text.slice(0, 80)}`)

  // 核心：创建者删除必须成功
  const del = await api(`/api/travels/${id}`, { method: 'DELETE', cookie: owner })
  check('创建者删除个人旅行成功（本轮修复点）', del.status === 200, `status=${del.status} ${del.text.slice(0, 120)}`)

  const after = await api(`/api/travels/by-slug/${encodeURIComponent(slug)}/detail`, { cookie: owner })
  check('删除后详情返回 404', after.status === 404, `status=${after.status}`)

  const failed = out.filter((r) => !r.ok)
  console.log(`\n结果：${out.length - failed.length}/${out.length} 通过`)
  if (failed.length) { console.log('失败项：' + failed.map((f) => f.name).join(' / ')); process.exitCode = 1 }
})().catch((e) => { console.error('验证脚本异常：', e.message); process.exitCode = 1 })
