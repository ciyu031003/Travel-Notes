import type { ReactNode } from 'react'

// 静态导出：为 [slug] 段生成占位参数，覆盖 /travel/[slug] 与 /travel/[slug]/record
export function generateStaticParams() {
  return [{ slug: 'placeholder' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
