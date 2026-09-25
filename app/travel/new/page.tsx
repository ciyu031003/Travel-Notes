'use client'

import { useRouter } from 'next/navigation'
import TravelComposerForm from '@/components/travel/TravelComposerForm'
import { travelDetailHref } from '@/lib/routes'

/**
 * 移动端新建旅行专用页（独立全屏页面，非弹窗）。
 * 由底部 Dock 栏的「+」与旅行列表页的「＋ 新建旅行」按钮跳入。
 *
 * 创建成功后**直接进入该旅行详情页**（对齐参考产品：建完就进去看，
 * 而不是丢回列表让用户自己找）。
 *
 * ⚠️ 必须走 `travelDetailHref()` 而不是手拼 `/travel/<slug>`：
 * 本地壳（APK）是静态导出，`www/travel/` 下只有 `detail / new / record / placeholder`
 * 四个 HTML，**没有** `/travel/<slug>`。此前这里硬编码拼路径，导致真机
 * 「开始记录」之后落在一个导出里不存在的地址 —— 用户反馈的
 * 「新建完以后没有后续动作、也进不去」的直接根因之一。
 */
export default function TravelNewPage() {
  const router = useRouter()

  return (
    <TravelComposerForm
      onBack={() => router.replace('/travel')}
      onCreated={({ slug }) => {
        // 本地壳离线新建时也返回本地 slug：详情页会走本地兜底渲染，
        // 不再因为"云端还没有这本旅行"而显示「旅行不存在」。
        router.replace(slug ? travelDetailHref(slug) : '/travel')
      }}
    />
  )
}
