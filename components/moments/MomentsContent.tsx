'use client'

import { useState } from 'react'
import MomentComposer from './MomentComposer'
import MomentTimeline from './MomentTimeline'

/**
 * 碎碎念模块主体：发布器 + 时间线。
 * 发布成功后用 key 重挂载时间线以刷新（在线时拉取最新，离线时展示本地队列）。
 */
export default function MomentsContent() {
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <>
      <MomentComposer onCreated={() => setRefreshKey((k) => k + 1)} />
      <MomentTimeline key={refreshKey} />
    </>
  )
}
