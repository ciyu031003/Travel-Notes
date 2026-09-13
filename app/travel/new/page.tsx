'use client'

import { useRouter } from 'next/navigation'
import TravelComposer from '@/components/travel/TravelComposer'

/**
 * 移动端新建旅行专用页（独立页面，非弹窗）。
 * 由底部 Dock 栏的「+」跳入；创建成功/返回后回旅行列表。
 */
export default function TravelNewPage() {
  const router = useRouter()

  const handleClose = () => {
    router.replace('/travel')
  }

  return (
    <TravelComposer
      standalone
      hideTrigger
      autoOpen
      onCreated={() => {
        // 创建成功后稍作停留再返回列表，让「保存旅行」的成功提示清晰可见
        setTimeout(() => router.replace('/travel'), 500)
      }}
      onClose={handleClose}
    />
  )
}
