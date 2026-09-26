/**
 * 端到端验证（真实 HTTP）：新建旅行时的「归属空间 + 可见性三档」，以及权限边界。
 *
 * 覆盖产品诉求：
 *  · 新建时就能一键放进某个空间（成员可看可改）
 *  · 「仅自己」必须真的是仅自己（此前 visibility 一直吃 schema 默认 SPACE，
 *    用户勾了"仅自己"其实空间成员可见 —— 这是个真实泄露）
 *  · 「公开」后空间外的人也能看到；取消公开后不能
 *  · 只读成员不能往空间里创建内容
 *
 * 用法：先 npm run dev，再 node scripts/verify-travel-visibility.cjs
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
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  return { status: res.status, json, text, setCookie }
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
const OWNER = { u: `vown${s}`, p: 'Verify2026!x' }
const MEMBER = { u: `vmem${s}`, p: 'Verify2026!x' }
const VIEWER = { u: `vview${s}`, p: 'Verify2026!x' }
const OUTSIDER = { u: `vout${s}`, p: 'Verify2026!x' }

;(async () => {
  const owner = await login(OWNER.u, OWNER.p)
  const member = await login(MEMBER.u, MEMBER.p)
  const viewer = await login(VIEWER.u, VIEWER.p)
  const outsider = await login(OUTSIDER.u, OUTSIDER.p)

  // 空间 + 邀请码加入
  const c = await api('/api/spaces', { method: 'POST', cookie: owner, body: { name: `可见性验证空间${s}`, spaceType: 'FRIENDS' } })
  const spaceId = c.json?.spaceId
  if (!spaceId) throw new Error('创建空间失败: ' + c.text.slice(0, 200))

  async function join(role, cookie) {
    const inv = await api(`/api/spaces/${spaceId}/invites`, { method: 'POST', cookie: owner, body: { role, expiresInDays: 1 } })
    await api('/api/spaces/join', { method: 'POST', cookie, body: { code: inv.json?.code } })
  }
  await join('MEMBER', member)
  await join('VIEWER', viewer)

  /* ① 新建时直接放进空间（一键加入空间） */
  const inSpace = await api('/api/admin/travels', {
    method: 'POST', cookie: owner,
    body: { title: `空间内新建${s}`, location: '南京', startDate: '2026-11-01', endDate: '2026-11-02', spaceId, visibility: 'SPACE' },
  })
  check('新建时直接放进空间', inSpace.status === 201, `status=${inSpace.status} ${inSpace.text.slice(0, 120)}`)
  const tSpace = { id: inSpace.json?.id, slug: inSpace.json?.slug }
  const memberSees = await api(`/api/travels/by-slug/${encodeURIComponent(tSpace.slug)}/detail`, { cookie: member })
  check('空间成员立刻能看到（详情可读）', memberSees.status === 200, `status=${memberSees.status}`)
  check('空间成员可编辑', memberSees.json?.travel?.canEdit === true, `canEdit=${memberSees.json?.travel?.canEdit}`)
  const outsiderSees = await api(`/api/travels/by-slug/${encodeURIComponent(tSpace.slug)}/detail`, { cookie: outsider })
  check('空间外的人看不到（SPACE 可见性生效）', outsiderSees.status === 404, `status=${outsiderSees.status}`)

  /* ② 「仅自己」必须真的是仅自己（此前的泄露点） */
  const priv = await api('/api/admin/travels', {
    method: 'POST', cookie: owner,
    body: { title: `仅自己${s}`, location: '苏州', spaceId, visibility: 'PRIVATE' },
  })
  const tPriv = { id: priv.json?.id, slug: priv.json?.slug }
  const memberOnPriv = await api(`/api/travels/by-slug/${encodeURIComponent(tPriv.slug)}/detail`, { cookie: member })
  check('放进空间但选「仅自己」→ 成员看不到', memberOnPriv.status === 404, `status=${memberOnPriv.status}`)
  const ownerOnPriv = await api(`/api/travels/by-slug/${encodeURIComponent(tPriv.slug)}/detail`, { cookie: owner })
  check('自己仍然能看到', ownerOnPriv.status === 200 && !!ownerOnPriv.json?.travel, `status=${ownerOnPriv.status}`)

  /* ③ 不带可见性时的默认值 */
  const dfltPrivate = await api('/api/admin/travels', { method: 'POST', cookie: owner, body: { title: `默认无空间${s}` } })
  const d1 = await api(`/api/travels/by-slug/${encodeURIComponent(dfltPrivate.json.slug)}/detail`, { cookie: owner })
  check('不带空间/可见性 → 默认「仅自己」', d1.json?.travel?.visibility === 'PRIVATE', `visibility=${d1.json?.travel?.visibility}`)

  const dfltSpace = await api('/api/admin/travels', { method: 'POST', cookie: owner, body: { title: `默认有空间${s}`, spaceId } })
  const d2 = await api(`/api/travels/by-slug/${encodeURIComponent(dfltSpace.json.slug)}/detail`, { cookie: owner })
  check('带空间但不带可见性 → 默认「空间可见」', d2.json?.travel?.visibility === 'SPACE', `visibility=${d2.json?.travel?.visibility}`)

  /* ④ 公开按钮：公开 → 空间外可见；取消 → 又不可见 */
  const pub = await api(`/api/admin/travels/${tPriv.id}`, { method: 'PUT', cookie: owner, body: { visibility: 'PUBLIC' } })
  check('设为公开（PUT visibility=PUBLIC）', pub.status === 200, `status=${pub.status} ${pub.text.slice(0, 120)}`)
  const outsiderPub = await api(`/api/travels/by-slug/${encodeURIComponent(tPriv.slug)}/detail`, { cookie: outsider })
  check('公开后空间外的人也能看到', outsiderPub.status === 200, `status=${outsiderPub.status}`)
  const un = await api(`/api/admin/travels/${tPriv.id}`, { method: 'PUT', cookie: owner, body: { visibility: 'PRIVATE' } })
  const outsiderUn = await api(`/api/travels/by-slug/${encodeURIComponent(tPriv.slug)}/detail`, { cookie: outsider })
  check('取消公开后又看不到', un.status === 200 && outsiderUn.status === 404, `put=${un.status} get=${outsiderUn.status}`)

  /* ⑤ 权限边界：只读成员不能往空间里创建内容 */
  const viewerCreate = await api('/api/admin/travels', {
    method: 'POST', cookie: viewer, body: { title: `只读想建${s}`, spaceId },
  })
  check('只读成员不能创建到空间（403）', viewerCreate.status === 403, `status=${viewerCreate.status} ${viewerCreate.text.slice(0, 100)}`)
  const viewerPut = await api(`/api/admin/travels/${tSpace.id}`, { method: 'PUT', cookie: viewer, body: { visibility: 'PUBLIC' } })
  check('只读成员不能改可见性（403）', viewerPut.status === 403, `status=${viewerPut.status}`)
  const memberPut = await api(`/api/admin/travels/${tSpace.id}`, { method: 'PUT', cookie: member, body: { title: `成员改的标题${s}` } })
  check('成员可以编辑空间内旅行', memberPut.status === 200, `status=${memberPut.status}`)

  const failed = out.filter((r) => !r.ok)
  console.log(`\n结果：${out.length - failed.length}/${out.length} 通过`)
  if (failed.length) {
    console.log('失败项：' + failed.map((f) => f.name).join(' / '))
    process.exitCode = 1
  }
})().catch((e) => {
  console.error('验证脚本异常：', e.message)
  process.exitCode = 1
})
