/**
 * RemoteImage（P4 本地优先）的**首帧确定性**回归。
 *
 * 为什么单测这一层：服务端渲染/静态导出时 isNativePlatform() 恒为 false，而原生壳客户端是 true。
 * 如果组件按平台分支决定首帧输出（本地 = 占位块 / 远端 = <img>），SSR HTML 与客户端首帧就会不一致
 * → React 水合告警 + 整棵树重渲染。这里锁住两条契约：
 *  ① SSR 渲染的是**远端变体地址**（不依赖任何 Capacitor API，也不会去查本地库）；
 *  ② 即使平台探测为原生，首帧（水合前）也不输出 data-media-pending 占位 —— 只能等水合之后再切本地。
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const box = vi.hoisted(() => ({ native: false }))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => box.native }))

import RemoteImage, { type RemoteImageProps } from '@/components/mobile/RemoteImage'

function html(props: Partial<RemoteImageProps> & { alt?: string }): string {
  return renderToStaticMarkup(
    createElement(RemoteImage, { alt: '', src: null, ...props } as RemoteImageProps),
  )
}

describe('P4 · RemoteImage 首帧与水合确定性', () => {
  it('Web/SSR：渲染远端缩略变体，不出现本地占位', () => {
    box.native = false
    const out = html({ src: '/uploads/media/1.jpg', variant: 'thumbnail' })
    expect(out).toContain('/api/uploads/media/1-thumbnail.jpg')
    expect(out).toContain('data-media-source="remote"')
    expect(out).not.toContain('data-media-pending')
  })

  it('原生壳：水合首帧同样输出远端地址（否则与 SSR HTML 不一致）', () => {
    box.native = true
    const out = html({ src: '/uploads/media/2.jpg', mediaId: 2, variant: 'preview' })
    expect(out).toContain('/api/uploads/media/2-preview.jpg')
    expect(out).not.toContain('data-media-pending')
  })

  it('没有远端地址时首帧不渲染（占位交给调用方），也不会白屏抛错', () => {
    box.native = true
    expect(html({ src: null, mediaId: 'local-photo-1' })).toBe('')
  })

  it('original 变体直取原图（不派生后缀）', () => {
    box.native = false
    const out = html({ src: '/uploads/media/3.jpg', variant: 'original' })
    expect(out).toContain('/uploads/media/3.jpg')
    expect(out).not.toContain('-thumbnail.jpg')
  })
})
