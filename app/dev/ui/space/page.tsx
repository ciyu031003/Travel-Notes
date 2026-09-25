import { notFound } from 'next/navigation'
import SpacePreview from './SpacePreview'

export const metadata = {
  title: '空间模块预览 · DEV',
  robots: { index: false, follow: false },
}

/**
 * 空间模块预览台（/dev/ui/space）
 *
 * 安全守则与 /dev/ui、/dev/ui/v4 一致：生产构建下一律 404，避免开发工具暴露到线上。
 * 如需在预发环境查看，可显式设置 DEV_UI=1 后构建。
 *
 * 放在 /dev/ui/ 下而不是 /dev/space：`isDevToolPath()`（lib/public-paths.ts）
 * 只放行 /dev/ui 前缀，因此这一页**本地不需要登录、也不需要数据库** ——
 * 评审五套配色时不必先造数据。
 */
export default function DevUiSpacePage() {
  if (process.env.NODE_ENV === 'production' && process.env.DEV_UI !== '1') {
    notFound()
  }
  return <SpacePreview />
}
