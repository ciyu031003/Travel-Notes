import type { Metadata } from 'next'
import SpaceListClient from '@/components/space/SpaceListClient'

export const metadata: Metadata = {
  title: '我的空间',
  description: '情侣 / 家庭 / 朋友 / 独旅空间 —— 一起记录的旅行、相册与回忆',
  robots: { index: false, follow: false },
}

/**
 * 我的空间（/space）
 *
 * 刻意**不做服务端预取**：空间列表是登录后的私人数据，且创建/加入后要立刻刷新，
 * 走客户端 `/api/spaces`（与 `/admin/spaces` 同一份接口），改动面最小。
 * （列表里的空态、loading 都已处理，首屏不会闪。）
 */
export default function SpacePage() {
  return <SpaceListClient />
}
