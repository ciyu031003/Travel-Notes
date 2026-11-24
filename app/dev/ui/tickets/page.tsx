import { notFound } from 'next/navigation'
import TicketsPreview from './TicketsPreview'

export const metadata = {
  title: '旅程票据预览 · DEV',
  robots: { index: false, follow: false },
}

/**
 * 旅程票据预览台（/dev/ui/tickets）
 *
 * 安全守卫与 /dev/ui 一致：生产构建下一律 404，避免开发工具暴露到线上。
 * 如需在预发环境查看，可显式设置 DEV_UI=1 后构建。
 */
export default function DevTicketsPage() {
  if (process.env.NODE_ENV === 'production' && process.env.DEV_UI !== '1') {
    notFound()
  }
  return <TicketsPreview />
}
