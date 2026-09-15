import { notFound } from 'next/navigation'
import UiPreview from './UiPreview'

export const metadata = {
  title: '组件预览台 · DEV',
  robots: { index: false, follow: false },
}

/**
 * 组件预览台入口（/dev/ui）
 *
 * 安全守卫：生产构建下一律 404，避免把开发工具暴露到线上。
 * 如需在预发环境查看，可显式设置 DEV_UI=1 后构建。
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production' && process.env.DEV_UI !== '1') {
    notFound()
  }
  return <UiPreview />
}
