import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldAlert } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { Button } from '@/components/mobile/Button'
import { SpaceThemeScope } from '@/components/space/SpaceThemeScope'
import SpaceDetail, { type SpaceDetailData } from '@/components/space/SpaceDetail'
import { getCurrentUser } from '@/lib/current-user'
import { spaceService } from '@/lib/modules/space/space.service'
import { SpaceAccessError } from '@/lib/modules/space/permissions'
import { travelService as spaceTravelService } from '@/lib/modules/travel/space-travel.service'
import { listAlbumsForSpace } from '@/lib/modules/album/album.service'
import { memoryService } from '@/lib/modules/memory/memory.service'

export const metadata: Metadata = {
  title: '空间详情',
  robots: { index: false, follow: false },
}

/**
 * 空间详情页（/space/[slug]）
 *
 * 服务端直接走 service 层取数（不经 HTTP）：一次渲染拿齐五段内容 + 成员，
 * 比让客户端发 5 个请求更省往返，也让权限判定只在服务层发生一次。
 *
 * 权限：非成员 —— `getSpaceBySlug` 内部 `requireSpaceMember` 会抛 `SpaceAccessError`，
 * 这里渲染一个**明确的无权限页**（不泄露成员与内容），而不是 404 ——
 * 404 会让用户以为链接错了，而无权限才是真实原因。
 */
export default async function SpaceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/space/${slug}`)}`)
  }

  let data: SpaceDetailData | null = null
  let denied = false
  try {
    const space = await spaceService.getSpaceBySlug(user.username, slug)
    if (!space) {
      // slug 不存在 → 走 notFound 语义（这里直接给出更友好的返回入口）
      return <SpaceNotFound />
    }

    const [travels, albums, memories, activity, members] = await Promise.all([
      spaceTravelService.listTravels(user.username, space.id).catch(() => []),
      listAlbumsForSpace(space.id).catch(() => []),
      memoryService.listMemories(user.username, space.id).catch(() => []),
      spaceService.getActivity(user.username, space.id, 20).catch(() => []),
      spaceService.listMembers(user.username, space.id).catch(() => []),
    ])

    const now = Date.now()
    const upcoming = travels
      .filter((t) => {
        if (t.status !== 'PLANNED') return false
        if (!t.startDate) return true
        const ts = new Date(t.startDate).getTime()
        return Number.isFinite(ts) ? ts >= now : true
      })
      .slice(0, 4)

    data = {
      space: {
        id: space.id,
        name: space.name,
        slug: space.slug,
        description: space.description,
        spaceType: space.spaceType,
        myRole: space.myRole,
        memberCount: space.memberCount,
        members: space.members,
        createdAt: space.createdAt,
      },
      stats: {
        travelCount: space.travelCount ?? travels.length,
        albumCount: space.albumCount ?? albums.length,
        memoryCount: space.memoryCount ?? memories.length,
        mediaCount: space.mediaCount ?? 0,
      },
      travels: travels.slice(0, 6).map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        status: String(t.status),
        startDate: t.startDate,
        travelType: String(t.travelType),
        visibility: String(t.visibility),
      })),
      albums: albums.slice(0, 6).map((a) => ({
        id: a.id,
        title: a.title,
        coverUrl: a.coverUrl,
        mediaCount: a.mediaCount,
      })),
      memories: memories.slice(0, 6).map((m) => ({
        id: m.id,
        content: m.content ?? null,
        createdBy: m.createdBy ?? null,
        happenedAt: m.happenedAt ?? null,
      })),
      upcoming: upcoming.map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        startDate: t.startDate,
      })),
      activity: activity.map((a) => ({
        id: a.id,
        username: a.username,
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
      members: members
        .filter((m) => m.status === 'ACTIVE')
        .map((m) => ({
          id: m.id,
          username: m.username,
          nickname: m.nickname,
          avatarUrl: m.avatarUrl,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt,
        })),
    }
  } catch (error) {
    if (error instanceof SpaceAccessError) denied = true
    else throw error
  }

  if (denied) return <SpaceNoAccess />

  if (!data) return <SpaceNotFound />

  return (
    // 整页套一层空间主题作用域：这是"五套配色"的落点，也是影响面的边界
    <SpaceThemeScope type={data.space.spaceType}>
      <SpaceDetail data={data} />
    </SpaceThemeScope>
  )
}

function SpaceNoAccess() {
  return (
    <div className="m-gutter pb-24 pt-2">
      <LargeTitle title="无法访问" back="/space" />
      <div className="mt-10 flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-[var(--m-radius-card)] bg-[var(--social-surface2)] text-[var(--social-faint)]">
          <Icon icon={ShieldAlert} size="lg" />
        </span>
        <h2 className="mt-3 text-[18px] font-semibold text-[var(--social-text)]">你还不是这个空间的成员</h2>
        <p className="mt-1.5 max-w-[260px] text-[13px] leading-5 text-[var(--social-muted)]">
          空间内容只对成员开放。如果你有邀请码，可以在空间列表里输入加入。
        </p>
        <div className="mt-5">
          <Button href="/space">回空间列表</Button>
        </div>
      </div>
    </div>
  )
}

function SpaceNotFound() {
  return (
    <div className="m-gutter pb-24 pt-2">
      <LargeTitle title="空间不存在" back="/space" />
      <div className="mt-10 flex flex-col items-center text-center">
        <h2 className="text-[18px] font-semibold text-[var(--social-text)]">没有找到这个空间</h2>
        <p className="mt-1.5 text-[13px] text-[var(--social-muted)]">链接可能已失效，或者空间已被解散。</p>
        <Button className="mt-5" href="/space">
          回空间列表
        </Button>
      </div>
    </div>
  )
}
