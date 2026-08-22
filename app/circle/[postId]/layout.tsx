import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ postId: '0' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
