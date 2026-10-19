import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import * as admin from '@/lib/api/schemas/admin'
import * as me from '@/lib/api/schemas/me'
import * as common from '@/lib/api/schemas/common'
import * as travel from '@/lib/api/schemas/travel'
import * as space from '@/lib/api/schemas/space'
import * as memory from '@/lib/api/schemas/memory'
import * as social from '@/lib/api/schemas/social'
import { ApiError } from '@/lib/api-response'

/**
 * P3-38 契约测试：lib/api/schemas/** 的每个导出 schema。
 *
 * 每个 schema 至少覆盖：合法样例 / 缺必填 / 类型错 / 边界（长度或范围）。
 * 同时钉死统一错误响应形状 { success:false, error, code, requestId }
 * （lib/api-response.errorResponse + lib/api/handler 的 withAuth/parseBody）。
 *
 * 只断言「形状契约」，不断言具体业务文案的措辞（文案可微调，契约不能破）。
 */

interface ParseSuccess { success: true; data: unknown }
interface ParseFailure { success: false; error: { issues: Array<{ message: string }> } }
type Parsable = { safeParse: (value: unknown) => ParseSuccess | ParseFailure }

function pass(schema: Parsable, value: unknown): unknown {
  const r = schema.safeParse(value)
  expect(r.success, `应通过: ${JSON.stringify(value)}`).toBe(true)
  return (r as ParseSuccess).data
}

function fail(schema: Parsable, value: unknown, messagePart?: string): void {
  const r = schema.safeParse(value)
  expect(r.success, `应拒绝: ${JSON.stringify(value)}`).toBe(false)
  if (messagePart) {
    expect((r as ParseFailure).error.issues[0]?.message).toContain(messagePart)
  }
}

describe('① lib/api/schemas/common.ts 基础片段', () => {
  it('IdSchema：字符串/数字 coerce 为正整数，拒绝 0/负数/小数/非数字', () => {
    expect(pass(common.IdSchema, '42')).toBe(42)
    expect(pass(common.IdSchema, 7)).toBe(7)
    fail(common.IdSchema, '0', '正整数')
    fail(common.IdSchema, '-3', '正整数')
    fail(common.IdSchema, '1.5', '整数')
    fail(common.IdSchema, 'abc', '数字')
  })

  it('NullableDateStringSchema：空串/null 与合法日期通过，非法日期拒绝', () => {
    expect(pass(common.NullableDateStringSchema, '')).toBe('')
    expect(pass(common.NullableDateStringSchema, null)).toBeNull()
    pass(common.NullableDateStringSchema, '2026-10-19')
    fail(common.NullableDateStringSchema, 'not-a-date', '日期格式不正确')
    fail(common.NullableDateStringSchema, 'x'.repeat(41), '日期格式不正确')
  })

  it('NullableIdSchema：正整数或 null', () => {
    expect(pass(common.NullableIdSchema, null)).toBeNull()
    expect(pass(common.NullableIdSchema, '9')).toBe(9)
    fail(common.NullableIdSchema, '0')
  })

  it('parseIdParam：非法抛 ApiError(INVALID_ID, 400)，合法返回数字', () => {
    expect(common.parseIdParam('15', '相册 ID')).toBe(15)
    try {
      common.parseIdParam('abc', '相册 ID')
      throw new Error('should throw')
    } catch (e: any) {
      expect(e.code).toBe('INVALID_ID')
      expect(e.status).toBe(400)
      expect(e.message).toContain('相册 ID')
    }
  })

  it('toApiError：业务提示透传；Prisma/SQL/堆栈等内部信息替换为兜底文案', () => {
    expect(common.toApiError(new Error('旅行不存在')).message).toBe('旅行不存在')
    const leak = common.toApiError(new Error("PrismaClientKnownRequestError: select * from User"))
    expect(leak.message).toBe('操作失败')
    expect(leak.code).toBe('BAD_REQUEST')
    // 超长消息不当作业务提示
    expect(common.toApiError(new Error('不'.repeat(121))).message).toBe('操作失败')
    // 已是 ApiError 原样返回
    const api = new ApiError('X', '原始', 418)
    expect(common.toApiError(api)).toBe(api)
  })

  it('asApiErrorFromResponse：旧 {error} 响应 → 统一 code/status', async () => {
    const cases: Array<[number, string]> = [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [429, 'RATE_LIMITED'], [400, 'BAD_REQUEST']]
    for (const [status, code] of cases) {
      const res = NextResponse.json({ error: '拒绝原因' }, { status })
      const err = await common.asApiErrorFromResponse(res)
      expect(err.status).toBe(status)
      expect(err.code).toBe(code)
      expect(err.message).toBe('拒绝原因')
    }
    // 非 JSON 响应 → 兜底文案
    const plain = new NextResponse('oops', { status: 500 })
    const err = await common.asApiErrorFromResponse(plain)
    expect(err.status).toBe(500)
    expect(err.message).toBe('请求参数不合法')
  })

  it('parseOptionalBody：空 body → undefined；合法 → data；非法 JSON/形状 → ApiError', async () => {
    const schema = common.IdSchema
    const mk = (body: string) => new NextRequest('http://example.com/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    await expect(common.parseOptionalBody(mk(''), schema)).resolves.toBeUndefined()
    await expect(common.parseOptionalBody(mk('  '), schema)).resolves.toBeUndefined()
    await expect(common.parseOptionalBody(mk('"12"'), schema)).resolves.toBe(12)
    await expect(common.parseOptionalBody(mk('{oops'), schema)).rejects.toMatchObject({ code: 'INVALID_JSON' })
    await expect(common.parseOptionalBody(mk('"-1"'), schema)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('withRouteErrors：成功加 X-Request-Id；异常转统一错误形状', async () => {
    const okHandler = common.withRouteErrors(async () => NextResponse.json({ success: true }))
    const okRes = await okHandler(new NextRequest('http://example.com/api/x'))
    expect(okRes.status).toBe(200)
    expect(okRes.headers.get('X-Request-Id')).toBeTruthy()

    const bad = common.withRouteErrors(async () => { throw new ApiError('NOT_FOUND', '资源不存在', 404) })
    const badRes = await bad(new NextRequest('http://example.com/api/x', { headers: { 'x-request-id': 'req-route-1' } }))
    expect(badRes.status).toBe(404)
    expect(await badRes.json()).toEqual({ success: false, error: '资源不存在', code: 'NOT_FOUND', requestId: 'req-route-1' })

    const boom = common.withRouteErrors(async () => { throw new Error('prisma exploded') })
    const boomRes = await boom(new NextRequest('http://example.com/api/x'))
    expect(boomRes.status).toBe(500)
    const boomBody = await boomRes.json()
    expect(boomBody.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(boomBody)).not.toContain('prisma exploded')
  })
})

describe('② lib/api/schemas/admin.ts', () => {
  it('PaginationQuerySchema：字符串 coerce、边界 100/10000 与 0 拒绝', () => {
    expect(pass(admin.PaginationQuerySchema, { page: '2', pageSize: '20' })).toEqual({ page: 2, pageSize: 20 })
    pass(admin.PaginationQuerySchema, {})
    expect(pass(admin.PaginationQuerySchema, { pageSize: '100' })).toEqual({ pageSize: 100 })
    fail(admin.PaginationQuerySchema, { page: '0' })
    fail(admin.PaginationQuerySchema, { pageSize: '101' })
    fail(admin.PaginationQuerySchema, { page: '10001' })
  })

  it('EmailSchema / VerificationCodeSchema / 密码与用户名片段', () => {
    pass(admin.EmailSchema, 'a@b.com')
    fail(admin.EmailSchema, 'not-an-email', '邮箱')
    pass(admin.VerificationCodeSchema, '123456')
    fail(admin.VerificationCodeSchema, '12345', '6 位')
    fail(admin.VerificationCodeSchema, 'abcdef')
    fail(admin.CurrentPasswordSchema, '')
    fail(admin.CurrentPasswordSchema, 'x'.repeat(129))
    pass(admin.NewUsernameSchema, '小明_01')
    fail(admin.NewUsernameSchema, 'a', '2 位')
    fail(admin.NewUsernameSchema, 'a'.repeat(21), '20 位')
    fail(admin.NewUsernameSchema, 'bad name')
    fail(admin.NewPasswordSchema, '12345678')
    pass(admin.NewPasswordSchema, 'Str0ng#Passw0rd')
  })

  it('AlbumCreateSchema：合法/缺标题/空标题/travelId 类型错/description null', () => {
    const okData = { title: '  京都之行  ', travelId: '3', isPublic: true, description: null }
    expect(pass(admin.AlbumCreateSchema, okData)).toMatchObject({ title: '京都之行', travelId: 3 })
    fail(admin.AlbumCreateSchema, {})
    fail(admin.AlbumCreateSchema, { title: '   ' }, '相册名称')
    fail(admin.AlbumCreateSchema, { title: 'a'.repeat(256) }, '过长')
    fail(admin.AlbumCreateSchema, { title: 'ok', travelId: 'abc' })
    fail(admin.AlbumCreateSchema, { title: 'ok', isPublic: 'yes' })
  })

  it('AlbumUpdateSchema 全部可选；AlbumMediaDeleteSchema 必填 mediaId', () => {
    expect(pass(admin.AlbumUpdateSchema, {})).toEqual({})
    pass(admin.AlbumUpdateSchema, { title: '新名字' })
    fail(admin.AlbumUpdateSchema, { title: '' })
    expect(pass(admin.AlbumMediaDeleteSchema, { mediaId: '5' })).toEqual({ mediaId: 5 })
    fail(admin.AlbumMediaDeleteSchema, {})
  })

  it('AnniversaryCreate/UpdateSchema', () => {
    pass(admin.AnniversaryCreateSchema, { title: '第一次见面', date: '2020-05-20', recurring: false })
    fail(admin.AnniversaryCreateSchema, { title: 'x' })
    fail(admin.AnniversaryCreateSchema, { date: '2020-05-20' })
    expect(pass(admin.AnniversaryUpdateSchema, {})).toEqual({})
    fail(admin.AnniversaryUpdateSchema, { date: '' })
  })

  it('MomentCreateSchema：内容必填/上限 2000、标签 ≤10', () => {
    expect(pass(admin.MomentCreateSchema, { content: '  今天很好 ', tags: ['a', 'b'] })).toMatchObject({ content: '今天很好' })
    fail(admin.MomentCreateSchema, { content: '   ' }, '内容不能为空')
    fail(admin.MomentCreateSchema, { content: 'x'.repeat(2001) }, '2000')
    fail(admin.MomentCreateSchema, { content: 'ok', tags: Array.from({ length: 11 }, () => 't') }, '10 个标签')
  })

  it('ShareToCircleSchema / PreviewSchema', () => {
    expect(pass(admin.ShareToCircleSchema, {})).toEqual({})
    expect(pass(admin.ShareToCircleSchema, { visibility: 'SPACE', travelId: '2' })).toMatchObject({ travelId: 2 })
    fail(admin.ShareToCircleSchema, { visibility: 'X' })
    fail(admin.PreviewSchema, {})
    fail(admin.PreviewSchema, { content: '' })
    fail(admin.PreviewSchema, { content: 'x'.repeat(200_001) })
  })

  it('设置类 schema：SettingsUpdate / UsernameUpdate / EmailUnbind / BindEmail / SendCode / AnniversaryStart / Oil', () => {
    pass(admin.SettingsUpdateSchema, { currentPassword: 'old-pass' })
    fail(admin.SettingsUpdateSchema, {})
    fail(admin.SettingsUpdateSchema, { currentPassword: 'x', newPassword: '12345678' })
    pass(admin.UsernameUpdateSchema, { newUsername: 'newname', currentPassword: 'old' })
    fail(admin.UsernameUpdateSchema, { currentPassword: 'old' })
    pass(admin.EmailUnbindSchema, { currentPassword: 'old' })
    fail(admin.EmailUnbindSchema, {})
    pass(admin.BindEmailSchema, { email: 'a@b.com', code: '123456' })
    fail(admin.BindEmailSchema, { email: 'a@b.com', code: '1234' })
    fail(admin.SendCodeSchema, {})
    pass(admin.AnniversaryStartSchema, { anniversaryStart: null, currentPassword: 'old' })
    fail(admin.AnniversaryStartSchema, { anniversaryStart: '2020/05/20', currentPassword: 'old' })
    fail(admin.AnniversaryStartSchema, { anniversaryStart: '2020-05-20' })
    expect(pass(admin.OilSettingsSchema, {})).toEqual({})
    fail(admin.OilSettingsSchema, { apiKey: 'short' }, '长度不合法')
  })

  it('举报 / 旅行日 / 花销 / 行程 schema', () => {
    pass(admin.ReportActionSchema, { reportId: '3', action: 'DISMISS' })
    fail(admin.ReportActionSchema, { reportId: 3, action: 'NOPE' }, '无效的处理动作')
    fail(admin.ReportActionSchema, { action: 'DISMISS' })
    pass(admin.ReportListQuerySchema, { status: 'PENDING', page: '1', pageSize: '20' })
    fail(admin.ReportListQuerySchema, { status: 'BAD' })
    pass(admin.TravelDayCreateSchema, { date: '2026-10-19', title: '第一天' })
    fail(admin.TravelDayCreateSchema, { title: 'x'.repeat(256) })
    expect(pass(admin.TravelDayUpdateSchema, {})).toEqual({})
    expect(pass(admin.ExpenseCreateSchema, { amount: '12.5', note: '午餐' })).toMatchObject({ amount: 12.5 })
    fail(admin.ExpenseCreateSchema, { amount: 0 }, '有效金额')
    fail(admin.ExpenseCreateSchema, { amount: 'abc' })
    fail(admin.ExpenseCreateSchema, { amount: 100_000_001 })
    expect(pass(admin.ItineraryItemCreateSchema, { dayId: '4', title: '清水寺' })).toMatchObject({ dayId: 4 })
    fail(admin.ItineraryItemCreateSchema, { title: '清水寺' })
    fail(admin.ItineraryItemCreateSchema, { dayId: 4, title: '   ' })
  })
})

describe('③ lib/api/schemas/me.ts 头图焦点', () => {
  it('成对坐标通过；单边/越界/非数字拒绝；null 对表示恢复居中', () => {
    expect(pass(me.CoverFocusSchema, { focusX: '0.25', focusY: '0.5' })).toMatchObject({ focusX: 0.25, focusY: 0.5 })
    expect(pass(me.CoverFocusSchema, { focusX: null, focusY: null })).toEqual({ focusX: null, focusY: null })
    pass(me.CoverFocusSchema, {})
    fail(me.CoverFocusSchema, { focusX: 0.5 }, '焦点参数不合法')
    fail(me.CoverFocusSchema, { focusX: 1.5, focusY: 0.5 })
    fail(me.CoverFocusSchema, { focusX: 'abc', focusY: 0.5 })
  })
})

describe('④ lib/api/schemas/travel.ts', () => {
  it('枚举值只接受白名单', () => {
    pass(travel.TravelStatusSchema, 'ONGOING')
    fail(travel.TravelStatusSchema, 'DONE', '旅行状态无效')
    pass(travel.VisibilitySchema, 'PUBLIC')
    fail(travel.VisibilitySchema, 'FRIENDS', '可见性无效')
    pass(travel.TravelTypeSchema, 'COUPLE')
    fail(travel.TravelTypeSchema, 'SOLO', '旅行类型无效')
  })

  it('AddTravelDaySchema / AddItineraryItemSchema / UpdateItineraryItemSchema', () => {
    pass(travel.AddTravelDaySchema, { date: '', title: null, summary: null })
    fail(travel.AddTravelDaySchema, { title: 'x'.repeat(61) }, '标题过长')
    pass(travel.AddItineraryItemSchema, { dayId: '3', title: ' 岚山 ' })
    fail(travel.AddItineraryItemSchema, { title: '岚山' })
    fail(travel.AddItineraryItemSchema, { dayId: 3, title: 'x'.repeat(121) }, '名称过长')
    expect(pass(travel.UpdateItineraryItemSchema, {})).toEqual({})
    fail(travel.UpdateItineraryItemSchema, { title: '  ' })
  })

  it('AddExpenseSchema：金额 coerce/正数/上限，itineraryItemId 可空', () => {
    expect(pass(travel.AddExpenseSchema, { amount: '88.8', itineraryItemId: null })).toMatchObject({ amount: 88.8 })
    fail(travel.AddExpenseSchema, { amount: -1 }, '有效金额')
    fail(travel.AddExpenseSchema, { amount: 0 }, '有效金额')
    fail(travel.AddExpenseSchema, { amount: 100_000_001 }, '数值过大')
    fail(travel.AddExpenseSchema, { amount: 1, currency: 'x'.repeat(11) }, '币种无效')
    fail(travel.AddExpenseSchema, { amount: 1, itineraryItemId: 'abc' })
  })

  it('CreateTravelMemorySchema / UpdateTravelSpaceSchema / UpdateTravelInfoSchema', () => {
    pass(travel.CreateTravelMemorySchema, { title: '回忆', travelDayId: null })
    fail(travel.CreateTravelMemorySchema, { title: '' }, '回忆标题')
    expect(pass(travel.UpdateTravelSpaceSchema, {})).toEqual({ spaceId: null })
    expect(pass(travel.UpdateTravelSpaceSchema, { spaceId: '7' })).toEqual({ spaceId: 7 })
    expect(pass(travel.UpdateTravelSpaceSchema, { spaceId: '' })).toEqual({ spaceId: null })
    fail(travel.UpdateTravelSpaceSchema, { spaceId: '0' })
    // 注意：zod 的 coerce 会把 preprocess 出来的 null 也转成 0（'' → 0），与路由层「清空预算」语义一致
    expect(pass(travel.UpdateTravelInfoSchema, { budget: '', coverMediaId: '' })).toMatchObject({ budget: 0, coverMediaId: null })
    fail(travel.UpdateTravelInfoSchema, { budget: -1 })
    fail(travel.UpdateTravelInfoSchema, { budget: 'abc' })
    fail(travel.UpdateTravelInfoSchema, { title: '' })
  })
})

describe('⑤ lib/api/schemas/space.ts', () => {
  it('CreateInviteSchema：非法 role 回落 MEMBER，天数夹到 1..30，非数字回落 7', () => {
    expect(pass(space.CreateInviteSchema, { role: 'OWNER', expiresInDays: '10' })).toEqual({ role: 'MEMBER', expiresInDays: 10 })
    expect(pass(space.CreateInviteSchema, { expiresInDays: 99 })).toEqual({ role: 'MEMBER', expiresInDays: 30 })
    expect(pass(space.CreateInviteSchema, { expiresInDays: -2 })).toEqual({ role: 'MEMBER', expiresInDays: 1 })
    expect(pass(space.CreateInviteSchema, { expiresInDays: 'abc' })).toEqual({ role: 'MEMBER', expiresInDays: 7 })
    expect(pass(space.CreateInviteSchema, { role: 'VIEWER' })).toMatchObject({ role: 'VIEWER' })
  })

  it('AddSpaceMemberSchema / UpdateSpaceMemberRoleSchema / RemoveSpaceMemberSchema', () => {
    expect(pass(space.AddSpaceMemberSchema, { username: '  alice ', role: 'BAD' })).toEqual({ username: 'alice', role: 'MEMBER' })
    fail(space.AddSpaceMemberSchema, {}, '请输入成员用户名')
    fail(space.AddSpaceMemberSchema, { username: 'x'.repeat(51) }, '用户名过长')
    pass(space.UpdateSpaceMemberRoleSchema, { username: 'bob', role: 'VIEWER' })
    fail(space.RemoveSpaceMemberSchema, {}, '缺少成员用户名')
  })

  it('UpdateSpaceSchema / CreateSpaceMemorySchema', () => {
    pass(space.UpdateSpaceSchema, { name: '我们的小家' })
    fail(space.UpdateSpaceSchema, { name: 'a' }, '2-200')
    fail(space.UpdateSpaceSchema, { spaceType: 'UNKNOWN' }, '空间类型')
    expect(pass(space.UpdateSpaceSchema, { coverMediaId: '' })).toEqual({ coverMediaId: null })
    pass(space.CreateSpaceMemorySchema, { title: '回忆', visibility: 'SPACE' })
    fail(space.CreateSpaceMemorySchema, { title: '' })
    fail(space.CreateSpaceMemorySchema, { title: 'x', visibility: 'NOPE' })
  })

  it('CreateSpaceTravelSchema：slug 小写化/正则、companions ≤10', () => {
    expect(pass(space.CreateSpaceTravelSchema, { title: '京都', slug: '  KYOTO-2026 ', companions: [{ name: 'a' }] })).toMatchObject({ slug: 'kyoto-2026' })
    fail(space.CreateSpaceTravelSchema, { title: '京都', slug: '京' }, '旅行标识')
    fail(space.CreateSpaceTravelSchema, { title: '京都', slug: 'ab', companions: Array.from({ length: 11 }, () => ({})) }, '同行者最多 10 人')
    fail(space.CreateSpaceTravelSchema, { slug: 'ab' })
  })
})

describe('⑥ lib/api/schemas/memory.ts / social.ts', () => {
  it('UpdateMemorySchema：字段可选、可见性枚举', () => {
    expect(pass(memory.UpdateMemorySchema, {})).toEqual({})
    pass(memory.UpdateMemorySchema, { title: '新标题', visibility: 'PUBLIC' })
    fail(memory.UpdateMemorySchema, { title: '  ' })
    fail(memory.UpdateMemorySchema, { visibility: 'NOPE' }, '可见性无效')
  })

  it('AttachMemoryMediaSchema：mediaIds 非空数组、每项正整数、上限 50', () => {
    expect(pass(memory.AttachMemoryMediaSchema, { mediaIds: ['1', 2] })).toEqual({ mediaIds: [1, 2] })
    fail(memory.AttachMemoryMediaSchema, {}, '缺少 mediaIds')
    fail(memory.AttachMemoryMediaSchema, { mediaIds: [] }, '缺少 mediaIds')
    fail(memory.AttachMemoryMediaSchema, { mediaIds: ['0'] })
    fail(memory.AttachMemoryMediaSchema, { mediaIds: Array.from({ length: 51 }, (_, i) => i + 1) }, '50')
  })

  it('ReportPostSchema / MarkNotificationsReadSchema / AddPhotoMessageSchema', () => {
    pass(social.ReportPostSchema, { reason: '  垃圾广告 ' })
    fail(social.ReportPostSchema, { reason: '   ' }, '举报原因')
    fail(social.ReportPostSchema, { reason: 'x'.repeat(256) }, '举报原因过长')
    expect(pass(social.MarkNotificationsReadSchema, {})).toEqual({})
    expect(pass(social.MarkNotificationsReadSchema, { ids: ['1', 2] })).toEqual({ ids: [1, 2] })
    fail(social.MarkNotificationsReadSchema, { ids: Array.from({ length: 501 }, (_, i) => i + 1) }, '500')
    fail(social.MarkNotificationsReadSchema, { ids: ['abc'] })
    pass(social.AddPhotoMessageSchema, { image: ' abc ', content: ' 你好 ' })
    fail(social.AddPhotoMessageSchema, { content: '你好' }, '图片标识')
    fail(social.AddPhotoMessageSchema, { image: 'x' }, '留言内容不能为空')
    fail(social.AddPhotoMessageSchema, { image: 'x', content: 'x'.repeat(501) }, '留言过长')
  })
})

describe('⑦ 统一错误响应形状契约 { success:false, error, code, requestId }', () => {
  it('ApiError → 原样映射 status/code/message，并回传 requestId', async () => {
    const { errorResponse, ApiError } = await import('@/lib/api-response')
    const res = errorResponse(new ApiError('VALIDATION_ERROR', '请求参数不合法', 400), 'req-contract-1')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      error: '请求参数不合法',
      code: 'VALIDATION_ERROR',
      requestId: 'req-contract-1',
    })
  })

  it('未知异常 → 500 + INTERNAL_ERROR，且不泄露内部信息', async () => {
    const { errorResponse } = await import('@/lib/api-response')
    const res = errorResponse(new Error('PrismaClientKnownRequestError: select * from User'), 'req-contract-2')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: '服务器内部错误', code: 'INTERNAL_ERROR', requestId: 'req-contract-2' })
    expect(JSON.stringify(body)).not.toContain('Prisma')
  })
})

describe('⑧ parseBody / withAuth 统一契约（lib/api/handler）', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('parseBody：合法数据返回 data；非法形状 → VALIDATION_ERROR；非法 JSON → INVALID_JSON', async () => {
    const { parseBody } = await import('@/lib/api/handler')
    const req = (body: string) => new NextRequest('http://example.com/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body })

    await expect(parseBody(req('{"mediaId":"3"}'), admin.AlbumMediaDeleteSchema)).resolves.toEqual({ mediaId: 3 })
    await expect(parseBody(req('{}'), admin.AlbumMediaDeleteSchema)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    await expect(parseBody(req('{bad'), admin.AlbumMediaDeleteSchema)).rejects.toMatchObject({ code: 'INVALID_JSON', status: 400 })
  })

  it('withAuth：未登录 → 401 / 数据库不可用 → 503，形状统一并带 X-Request-Id', async () => {
    const authMod = await import('@/lib/auth-middleware')
    const spy = vi.spyOn(authMod, 'requireAuth')
    const { withAuth } = await import('@/lib/api/handler')

    spy.mockResolvedValueOnce({ authenticated: false, status: 401 } as any)
    const handler = withAuth(async () => NextResponse.json({ success: true }))
    const unauth = await handler(new NextRequest('http://example.com/api/x', { headers: { 'x-request-id': 'req-auth-1' } }))
    expect(unauth.status).toBe(401)
    expect(unauth.headers.get('X-Request-Id')).toBe('req-auth-1')
    expect(await unauth.json()).toEqual({ success: false, error: '未授权', code: 'UNAUTHORIZED', requestId: 'req-auth-1' })

    spy.mockResolvedValueOnce({ authenticated: false, status: 503, databaseUnavailable: true } as any)
    const unavailable = await handler(new NextRequest('http://example.com/api/x'))
    expect(unavailable.status).toBe(503)
    expect((await unavailable.json()).code).toBe('AUTH_UNAVAILABLE')

    spy.mockResolvedValueOnce({ authenticated: true, username: 'alice', payload: { userId: 1, username: 'alice' } } as any)
    const okRes = await handler(new NextRequest('http://example.com/api/x', { headers: { 'x-request-id': 'req-auth-2' } }))
    expect(okRes.status).toBe(200)
    expect(okRes.headers.get('X-Request-Id')).toBe('req-auth-2')
    spy.mockRestore()
  })
})
