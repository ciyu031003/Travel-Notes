'use client'

import { useRouter } from 'next/navigation'
import TravelComposerForm from '@/components/travel/TravelComposerForm'

/**
 * 移动端新建旅行专用页（独立全屏页面，非弹窗）。
 * 由底部 Dock 栏的「+」跳入。
 *
 * 创建成功后**直接进入该旅行详情页**（对齐参考产品：建完就进去看，
 * 而不是丢回列表让用户自己找）。离线本地保存时还没有云端 slug，回列表。
 */
export default function TravelNewPage() {
  const router = useRouter()

  return (
    <TravelComposerForm
      onBack={() => router.replace('/travel')}
      onCreated={({ slug }) => {
        router.replace(slug ? `/travel/${encodeURIComponent(slug)}` : '/travel')
      }}
    />
  )
}
