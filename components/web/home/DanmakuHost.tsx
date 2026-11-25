'use client'

import { forwardRef } from 'react'
import { DanmakuSection, type DanmakuSectionHandle } from '@/components/home/DanmakuSection'

/**
 * 弹幕留言的懒加载壳：DanmakuSection 依赖 Modal + 登录态请求，桌面首页首屏不需要它。
 * 单独拆一层 forwardRef 壳，HomeClient 才能 ref.open()（next/dynamic 不保证透传 ref）。
 */
const DanmakuHost = forwardRef<DanmakuSectionHandle>(function DanmakuHost(_props, ref) {
  return <DanmakuSection ref={ref} />
})

export default DanmakuHost
