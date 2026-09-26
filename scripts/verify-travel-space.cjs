/**
 * 端到端验证（打真实 HTTP，不是 mock）：
 *  ① 把一本旅行放进空间 → 空间成员能看到并「可编辑」，只读成员只能看；
 *  ② 详情接口的 canEdit 走角色判定（此前只比 ownerId → 空间成员永远只读）；
 *  ③ 移出空间后回到「仅自己」。
 *
 * 用法：先 npm run dev（或 next start），再 node scripts/verify-travel-space.cjs
 */
const BASE = process.env.TN_BASE || 'http://localhost:3000'

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
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
  // 注册（已存在则忽略）
  await api('/api/register', { method: 'POST', body: { username, password } })
  const r = await api('/api/login', { method: 'POST', body: { username, password } })
  if (r.status !== 200) throw new Error(`登录失败 ${username}: ${r.status} ${r.text.slice(0, 200)}`)
  const cookie = (r.setCookie || []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error(`未拿到会话 cookie: ${JSON.stringify(r.setCookie)}`)
  return cookie
}

const stamp = Date.now()
const OWNER = { u: `vowner${stamp}`, p: 'Verify2026!x' }
const MEMBER = { u: `vmember${stamp}`, p: 'Verify2026!x' }
const VIEWER = { u: `vviewer${stamp}`, p: 'Verify2026!x' }

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`)
}

;(async () => {
  const ownerCookie = await login(OWNER.u, OWNER.p)
  const memberCookie = await login(MEMBER.u, MEMBER.p)
  const viewerCookie = await login(VIEWER.u, VIEWER.p)
  console.log('三个账号已就绪（主人 / 成员 / 只读）')

  // 主人建一个家庭空间
  const c = await api('/api/spaces', {
    method: 'POST',
    cookie: ownerCookie,
    body: { name: `验证家庭空间${stamp}`, spaceType: 'FAMILY', description: '验证用' },
  })
  check('创建空间（含类型，中文名不再 400）', c.status === 201, `status=${c.status} ${c.text.slice(0, 120)}`)
  const spaceId = c.json?.spaceId
  if (!spaceId) throw new Error('未拿到 spaceId')

  // 生成邀请码并让 成员 / 只读 加入
  async function inviteAndJoin(role, cookie, label) {
    const inv = await api(`/api/spaces/${spaceId}/invites`, {
      method: 'POST', cookie: ownerCookie, body: { role, expiresInDays: 1 },
    })
    if (inv.status !== 201 && inv.status !== 200) throw new Error(`邀请码生成失败 ${label}: ${inv.status} ${inv.text.slice(0, 200)}`)
    const code = inv.json?.code
    const j = await api('/api/spaces/join', { method: 'POST', cookie, body: { code } })
    // join 成功返回 201（资源创建语义）
    check(`${label} 用邀请码加入`, j.status === 201 || j.status === 200, `status=${j.status} ${j.text.slice(0, 120)}`)
  }
  await inviteAndJoin('MEMBER', memberCookie, '成员')
  await inviteAndJoin('VIEWER', viewerCookie, '只读成员')

  // 成员表必须写 userId（否则按 userId 的权限判定全部失效）
  const members = await api(`/api/spaces/${spaceId}/members`, { cookie: ownerCookie })
  const memberRows = members.json?.members || []
  check('成员列表返回用户信息（userId 已回填）', memberRows.length === 3, `members=${memberRows.length}`)

  // 主人新建一本旅行
  const t = await api('/api/admin/travels', {
    method: 'POST', cookie: ownerCookie,
    body: { title: `验证旅行${stamp}`, location: '南京', startDate: '2026-10-01', endDate: '2026-10-03' },
  })
  check('创建旅行', t.status === 201, `status=${t.status} ${t.text.slice(0, 140)}`)
  const travelId = t.json?.id
  const slug = t.json?.slug
  if (!travelId || !slug) throw new Error('未拿到旅行 id/slug')

  const before = await api(`/api/travels/by-slug/${encodeURIComponent(slug)}/detail`, { cookie: ownerCookie })
  check('默认归属为「仅自己」', before.json?.travel?.spaceId === null, `spaceId=${before.json?.travel?.spaceId}`)

  // 移入空间
  const mv = await api(`/api/travels/${travelId}/space`, {
    method: 'PATCH', cookie: ownerCookie, body: { spaceId },
  })
  check('主人把旅行移入空间', mv.status === 200, `status=${mv.status} ${mv.text.slice(0, 140)}`)

  // 成员的视角：能看到 + 可编辑（核心诉求）
  const asMember = await api(`/api/travels/by-slug/${encodeURIComponent(slug)}/detail`, { cookie: memberCookie })
  check('成员能看到这本旅行', asMember.status === 200 && !!asMember.json?.travel, `status=${asMember.status}`)
  check('成员 canEdit=true（可一起修改）', asMember.json?.travel?.canEdit === true, `canEdit=${asMember.json?.travel?.canEdit}`)
  check('成员看到所属空间名与角色', asMember.json?.travel?.spaceId === spaceId && asMember.json?.travel?.mySpaceRole === 'MEMBER',
    `spaceId=${asMember.json?.travel?.spaceId} role=${asMember.json?.travel?.mySpaceRole}`)
  check('成员不是创建者 → 不能改归属', asMember.json?.travel?.canMoveSpace === false, `canMoveSpace=${asMember.json?.travel?.canMoveSpace}`)

  // 成员真的能写（不是只显示按钮）
  const memberWrite = await api(`/api/travels/${travelId}/days`, {
    method: 'POST', cookie: memberCookie, body: { title: '成员加的一天' },
  })
  check('成员可以真的写入（添加行程天）', memberWrite.status === 200 || memberWrite.status === 201, `status=${memberWrite.status} ${memberWrite.text.slice(0, 120)}`)

  // 只读成员的视角
  const asViewer = await api(`/api/travels/by-slug/${encodeURIComponent(slug)}/detail`, { cookie: viewerCookie })
  check('只读成员能看到', asViewer.status === 200 && !!asViewer.json?.travel, `status=${asViewer.status}`)
  check('只读成员 canEdit=false（只能看）', asViewer.json?.travel?.canEdit === false, `canEdit=${asViewer.json?.travel?.canEdit}`)
  const viewerWrite = await api(`/api/travels/${travelId}/days`, {
    method: 'POST', cookie: viewerCookie, body: { title: '只读想加的一天' },
  })
  check('只读成员写入被服务端拒绝', viewerWrite.status === 403, `status=${viewerWrite.status} ${viewerWrite.text.slice(0, 120)}`)

  // 空间详情页能看到这本旅行
  const spaceOverview = await api(`/api/spaces/by-slug/${encodeURIComponent(c.json.slug)}`, { cookie: memberCookie })
  const spaceTravelIds = (spaceOverview.json?.travels || []).map((x) => x.id)
  check('空间详情页列出这本旅行', spaceTravelIds.includes(travelId), `travels=${JSON.stringify(spaceTravelIds)}`)

  // 移出空间
  const back = await api(`/api/travels/${travelId}/space`, { method: 'PATCH', cookie: ownerCookie, body: { spaceId: null } })
  check('收回为「仅自己」', back.status === 200 && back.json?.spaceId === null, `status=${back.status}`)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) {
    console.log('失败项：')
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`)
    process.exitCode = 1
  }
})().catch((e) => {
  console.error('验证脚本异常：', e.message)
  process.exitCode = 1
})
