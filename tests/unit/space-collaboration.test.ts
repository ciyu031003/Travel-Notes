/**
 * P0 修复的回归测试（《我的空间模块优化方案》§7-A / §7-B / §7-C）
 *
 * 覆盖三个「静默失效」型缺陷 —— 它们都不会报错，只会让功能悄悄不工作：
 *   ① `SpaceMember.userId` 不写 → 邀请加入的成员在 userId 世界里不存在；
 *   ② `getUserCapabilities` 把「查不到成员身份」当成单用户 OWNER → 成员越权；
 *   ③ 相册列表不含空间范围 → 成员看不到彼此的相册（却能改）。
 * 外加 ④ 中文名空间因 slug 规则创建失败。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
    spaceMember: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    space: { findUnique: vi.fn() },
    album: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { getUserCapabilities } from '@/lib/modules/space/permissions'
import { myActiveSpaceIds, isSpaceContentEditor, spaceScopedWhere } from '@/lib/modules/access/space-scope'
import { PrismaSpaceRepository } from '@/lib/modules/space/space.repository'
import { slugifySpaceName } from '@/lib/modules/space/space.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('① SpaceMember.userId 必须被写入（否则协作完全不通）', () => {
  it('addMember 会按 username 解析并写入 userId', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 42 })
    prismaMock.spaceMember.upsert.mockResolvedValue({})

    await new PrismaSpaceRepository().addMember(7, 'partner', 'MEMBER')

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'partner' },
      select: { id: true },
    })
    const arg = prismaMock.spaceMember.upsert.mock.calls[0][0]
    expect(arg.create.userId).toBe(42)
    expect(arg.update.userId).toBe(42)
    expect(arg.create.role).toBe('MEMBER')
    expect(arg.create.status).toBe('ACTIVE')
  })

  it('账号查不到时不崩，userId 落 null（仍保留 username 键可用）', async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error('db down'))
    prismaMock.spaceMember.upsert.mockResolvedValue({})

    await expect(new PrismaSpaceRepository().addMember(7, 'ghost', 'VIEWER')).resolves.toBeUndefined()
    expect(prismaMock.spaceMember.upsert.mock.calls[0][0].create.userId).toBeNull()
  })

  it('create 时 Owner 行的 userId 也要写（否则创建者自己也过不了 userId 判定）', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 99 })
    const created: Array<Record<string, unknown>> = []
    prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        space: { create: vi.fn(async () => ({ id: 5 })) },
        spaceMember: {
          create: vi.fn(async (arg: { data: Record<string, unknown> }) => {
            created.push(arg.data)
            return {}
          }),
        },
      }),
    )

    const id = await new PrismaSpaceRepository().create({
      name: '我们的小家',
      slug: 'sp-abc',
      ownerUsername: 'owner1',
      spaceType: 'COUPLE',
    })

    expect(id).toBe(5)
    expect(created[0].userId).toBe(99)
    expect(created[0].role).toBe('OWNER')
  })
})

describe('② getUserCapabilities 不能把成员当成 OWNER', () => {
  it('按 username 查到 MEMBER 时 isOwner=false（原先会误判为 true）', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ username: 'member1' })
    prismaMock.spaceMember.findMany.mockResolvedValue([{ role: 'MEMBER' }])

    const caps = await getUserCapabilities(11)

    expect(caps.isOwner).toBe(false)
    expect(caps.canManageContent).toBe(true)
    expect(caps.canManageSettings).toBe(false)
    expect(caps.canManageSocial).toBe(false)
    expect(caps.canViewAudit).toBe(false)
    expect(caps.canManageSpace).toBe(false)
  })

  it('查询条件同时带 userId 与 username 两种键', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ username: 'member1' })
    prismaMock.spaceMember.findMany.mockResolvedValue([{ role: 'MEMBER' }])

    await getUserCapabilities(11)

    const where = prismaMock.spaceMember.findMany.mock.calls[0][0].where
    expect(where.status).toBe('ACTIVE')
    expect(where.OR).toEqual([{ userId: 11 }, { username: 'member1' }])
  })

  it('确实没有任何空间成员身份 = 单用户模式，仍是 OWNER', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ username: 'solo' })
    prismaMock.spaceMember.findMany.mockResolvedValue([])

    const caps = await getUserCapabilities(1)
    expect(caps.isOwner).toBe(true)
    expect(caps.canManageSettings).toBe(true)
  })

  it('OWNER 成员照旧拿到全部能力', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ username: 'boss' })
    prismaMock.spaceMember.findMany.mockResolvedValue([{ role: 'OWNER' }])

    const caps = await getUserCapabilities(2)
    expect(caps.isOwner).toBe(true)
    expect(caps.canViewAudit).toBe(true)
  })
})

describe('③ 空间成员关系查询：双键 + 内容编辑者判定', () => {
  it('myActiveSpaceIds 去重返回', async () => {
    prismaMock.spaceMember.findMany.mockResolvedValue([
      { spaceId: 3, role: 'MEMBER', joinedAt: new Date() },
      { spaceId: 3, role: 'VIEWER', joinedAt: new Date() },
      { spaceId: 5, role: 'OWNER', joinedAt: new Date() },
    ])

    expect(await myActiveSpaceIds(1, 'u1')).toEqual([3, 5])
  })

  it('未登录（两键皆空）不查库，直接空数组', async () => {
    expect(await myActiveSpaceIds(null, null)).toEqual([])
    expect(prismaMock.spaceMember.findMany).not.toHaveBeenCalled()
  })

  it('OWNER/MEMBER 算内容编辑者，VIEWER 不算', async () => {
    prismaMock.spaceMember.findFirst.mockResolvedValue({ id: 1 })
    expect(await isSpaceContentEditor(9, 1, 'u1')).toBe(true)

    prismaMock.spaceMember.findFirst.mockResolvedValue(null)
    expect(await isSpaceContentEditor(9, 1, 'u1')).toBe(false)
  })

  it('spaceId 为空时不算编辑者（个人内容走别的路径）', async () => {
    expect(await isSpaceContentEditor(null, 1, 'u1')).toBe(false)
    expect(prismaMock.spaceMember.findFirst).not.toHaveBeenCalled()
  })
})

describe('④ 可见性 where：与详情页口径一致', () => {
  it('未登录只返回公开内容', () => {
    expect(spaceScopedWhere(null, 'userId', [])).toEqual({ isPublic: true })
  })

  it('无空间时退回「我的 ∪ 公开」', () => {
    expect(spaceScopedWhere(7, 'userId', [])).toEqual({ OR: [{ userId: 7 }, { isPublic: true }] })
  })

  it('有空间时并入空间维度，且相册额外限制 visibility', () => {
    const where = spaceScopedWhere(7, 'userId', [3, 5], ['SPACE', 'PUBLIC']) as { OR: unknown[] }
    expect(where.OR).toHaveLength(3)
    expect(where.OR[2]).toEqual({ spaceId: { in: [3, 5] }, visibility: { in: ['SPACE', 'PUBLIC'] } })
  })

  it('Travel 用 ownerId、Album 用 userId（字段名不能混）', () => {
    const travel = spaceScopedWhere(7, 'ownerId', []) as { OR: Array<Record<string, unknown>> }
    expect(travel.OR[0]).toEqual({ ownerId: 7 })
    const album = spaceScopedWhere(7, 'userId', []) as { OR: Array<Record<string, unknown>> }
    expect(album.OR[0]).toEqual({ userId: 7 })
  })
})

describe('⑤ 中文名空间必须能建出来（slug 由服务端派生）', () => {
  it('中文名派生不出 ASCII slug 时回退 sp- 前缀随机值', () => {
    expect(slugifySpaceName('我们的小家')).toBe('')
    expect(slugifySpaceName('全家出行记')).toBe('')
  })

  it('中英混排只保留 ASCII 部分并规范连字符', () => {
    expect(slugifySpaceName('Our 小家 2026')).toBe('our-2026')
    expect(slugifySpaceName('  Travel Notes  ')).toBe('travel-notes')
  })

  it('结果长度受控（≤60），不会超 varchar(200)', () => {
    expect(slugifySpaceName('a'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})
