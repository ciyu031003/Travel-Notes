import { notFound } from 'next/navigation'
import UiV4Preview from './UiV4Preview'

export const metadata = {
  title: 'M5 组件预览 · DEV',
  robots: { index: false, follow: false },
}

/**
 * M5 组件预览台（/dev/ui/v4）
 *
 * 安全守则与 /dev/ui 一致：生产构建下一律 404，避免开发工具暴露到线上。
 * 如需在预发环境查看，可显式设置 DEV_UI=1 后构建。
 */
export default function DevUiV4Page() {
  if (process.env.NODE_ENV === 'production' && process.env.DEV_UI !== '1') {
    notFound()
  }
  return <UiV4Preview />
}
