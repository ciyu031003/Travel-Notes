/**
 * 空间概览的**纯类型**（不含任何服务端依赖）。
 *
 * 为什么要单独一个文件：空间详情页在移动端是**静态导出**的客户端壳，
 * 它需要用同一份类型描述 API 返回的数据。若从 `space-overview.service.ts`
 * 取类型，客户端组件会把 prisma / 服务层拖进浏览器 bundle。
 * 因此类型定义与实现分离，两边都从这里 import（客户端必须 `import type`）。
 */

export interface SpaceOverviewMember {
  id: number
  username: string
  nickname: string | null
  avatarUrl: string | null
  role: string
  status: string
  joinedAt: string
}

export interface SpaceOverviewTravel {
  id: number
  title: string
  slug: string
  status: string
  startDate: string | null
  travelType: string
  visibility: string
}

export interface SpaceOverviewAlbum {
  id: number
  title: string
  coverUrl: string | null
  mediaCount: number
}

export interface SpaceOverviewMemory {
  id: number
  content: string | null
  createdBy: string | null
  happenedAt: string | null
}

export interface SpaceOverviewActivity {
  id: number
  username: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: string | null
  createdAt: string
}

export interface SpaceOverviewSpace {
  id: number
  name: string
  slug: string
  description: string | null
  spaceType: string
  myRole: string
  memberCount: number
  members: Array<{ username: string; nickname: string | null; avatarUrl: string | null; role: string }>
  createdAt: string
}

export interface SpaceOverview {
  space: SpaceOverviewSpace
  stats: { travelCount: number; albumCount: number; memoryCount: number; mediaCount: number }
  travels: SpaceOverviewTravel[]
  albums: SpaceOverviewAlbum[]
  memories: SpaceOverviewMemory[]
  upcoming: Array<{ id: number; title: string; slug: string; startDate: string | null }>
  activity: SpaceOverviewActivity[]
  members: SpaceOverviewMember[]
}
