'use client'

import { useCallback, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import MomentComposer from './MomentComposer'
import MomentTimeline, { type MomentTimelineHandle } from './MomentTimeline'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { BottomSheet } from '@/components/mobile/BottomSheet'

/**
 * 碎碎念模块主体：发布器 + 时间线。
 * 发布成功后用 key 重挂载时间线以刷新（在线时拉取最新，离线时展示本地队列）。
 */
export default function MomentsContent() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [composerOpen, setComposerOpen] = useState(false)
  const timelineRef = useRef<MomentTimelineHandle>(null)

  const handleCreated = useCallback(() => {
    setComposerOpen(false)
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <>
      {/* 桌面：直排发布器（零回归） */}
      <div className="hidden md:block">
        <MomentComposer onCreated={handleCreated} />
      </div>

      {/* 时间线：移动端下拉刷新，桌面无手势零影响 */}
      <PullToRefresh onRefresh={() => void timelineRef.current?.reload()}>
        <MomentTimeline ref={timelineRef} key={refreshKey} />
      </PullToRefresh>

      {/* 移动端：FAB + iOS 底部面板发布器 */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="写下此刻"
          onClick={() => setComposerOpen(true)}
          className="m-fab fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-[45] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #C67A4E 0%, #A85F3A 60%, #8A4A2B 100%)',
          }}
        >
          <Plus className="h-7 w-7" strokeWidth={2.4} />
        </button>

        <BottomSheet open={composerOpen} onClose={() => setComposerOpen(false)} title="写下此刻">
          <MomentComposer onCreated={handleCreated} className="mb-0" />
        </BottomSheet>
      </div>
    </>
  )
}
