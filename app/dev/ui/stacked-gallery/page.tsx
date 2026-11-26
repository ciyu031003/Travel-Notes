'use client'

import StackedGallery from '@/components/mobile/StackedGallery'

/**
 * 堆叠相册预览（开发用）
 * ---------------------------------------------------------------------------
 * 旅行详情顶部、旅行圈记录都用 components/mobile/StackedGallery。
 * 这里用一个 6 张图的假数据把「堆叠 + 左右滑动 + 3D 倾角」单独摆出来，
 * 方便改组件时直接看动效，不用先造一整套旅行照片。
 * 只在 /dev 下挂载，移动静态壳会整段排除 app/dev。
 */

const MOCK = [
  '/videos/clover-poster.jpg',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=70',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=900&q=70',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=900&q=70',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=70',
  '/videos/clover-poster.jpg',
]

export default function StackedGalleryPreviewPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 py-6">
      <h1 className="text-[18px] font-bold text-[var(--m-text)]">堆叠相册 · StackedGallery</h1>
      <p className="mt-1 text-[13px] text-[var(--m-muted)]">
        左右滑动 / 上下滑动切换；点击当前卡触发 onOpen。下面同时给出 16:10（旅行详情顶部）与 4:5（旅行圈）两种比例。
      </p>
      <section className="mt-5">
        <h2 className="m-section-title">16 / 10 · 旅行详情顶部</h2>
        <StackedGallery images={MOCK} alt="堆叠相册预览" aspectRatio="16 / 10" className="mt-2" />
      </section>
      <section className="mt-6">
        <h2 className="m-section-title">4 / 5 · 旅行圈记录</h2>
        <StackedGallery images={MOCK} alt="堆叠相册预览" className="mt-2" />
      </section>
    </main>
  )
}
