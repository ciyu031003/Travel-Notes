'use client'

import { useState } from 'react'
import PhotoDeck from '@/components/mobile/PhotoDeck'

/** 本地调试页：堆叠相册牌堆（仅 dev 预览，构建移动壳时 app/dev 会被裁掉） */
const IMAGES = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => '/uploads/media/' + i + '.jpg')

export default function PhotoDeckPreviewPage() {
  const [opened, setOpened] = useState<number | null>(null)

  return (
    <main className="mx-auto w-full max-w-[420px] px-4 py-8">
      <h1 className="text-[18px] font-bold text-[var(--m-text)]">堆叠相册 · 牌堆预览</h1>
      <p className="mt-1 text-[13px] text-[var(--m-muted)]">左右滑动 / 拖拽卡片切换，点顶卡打开大图</p>

      <div className="circle-story-stack mt-5">
        <PhotoDeck images={IMAGES} alt="川西环线" onOpen={(i) => setOpened(i)} />
      </div>

      <p className="mt-3 text-[13px] text-[var(--m-muted)]" data-testid="opened">
        {opened === null ? '未打开大图' : '已打开第 ' + (opened + 1) + ' 张'}
      </p>

      {/* 模拟「最下方照片一张张」的列表（真实页面里是旅行照片 / 按天分组） */}
      <div className="mt-6 grid grid-cols-3 gap-1.5">
        {IMAGES.map((src, i) => (
          <div key={src} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--m-surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={'照片 ' + (i + 1)} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          </div>
        ))}
      </div>
    </main>
  )
}