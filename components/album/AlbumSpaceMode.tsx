'use client'

import dynamicImport from 'next/dynamic'
import ErrorBoundary from '@/components/ErrorBoundary'
import type { AlbumCity } from '@/hooks/use-album-data'

// WebGL/Three 渲染器继续按需加载（与拆分前一致：ssr:false）
const GalaxyAlbumScene = dynamicImport(() => import('@/components/album/space/GalaxyAlbumScene'), { ssr: false })
// P1-19：PhotoChatView 静态引入 ParticlePhotoBackground → THREE，首屏白付 81+50KB gz。
// 它只在点开「照片留言」时用，改为 dynamic 后 three 只在该视图打开时下载。
const PhotoChatView = dynamicImport(() => import('@/components/album/PhotoChatView'), { ssr: false })

export interface SpaceChatPhoto {
  url: string
  key: string
  cityName: string
  date: string
}

/**
 * 银河模式：360° 全景唱片空间 + 照片留言覆盖层（P2-32 拆分自 album 页）。
 * 留言页叠在场景上方（不重建场景），两者各自包 ErrorBoundary。
 */
export default function AlbumSpaceMode({
  cities,
  chatPhoto,
  view,
  onTogglePixel,
  onOpenChat,
  onCloseChat,
  onWebGLFail,
}: {
  cities: AlbumCity[]
  chatPhoto: SpaceChatPhoto | null
  view: 'gallery' | 'chat'
  onTogglePixel: () => void
  onOpenChat: (photo: SpaceChatPhoto) => void
  onCloseChat: () => void
  onWebGLFail: () => void
}) {
  return (
    <div key="mode-space" className="motion-safe:animate-[fadeIn_.2s_ease-out]">
      {/* P1-20：WebGL 场景单独包错误边界 —— 上下文丢失/几何异常时只降级这块，不白屏 */}
      <ErrorBoundary label="GalaxyAlbumScene">
        <GalaxyAlbumScene
          cities={cities}
          onTogglePixel={onTogglePixel}
          onOpenChat={onOpenChat}
          onWebGLFail={onWebGLFail}
        />
      </ErrorBoundary>
      {view === 'chat' && chatPhoto && (
        <ErrorBoundary label="PhotoChatView">
          <PhotoChatView
            image={chatPhoto.url}
            imageKey={chatPhoto.key}
            cityName={chatPhoto.cityName}
            onBack={onCloseChat}
          />
        </ErrorBoundary>
      )}
    </div>
  )
}
