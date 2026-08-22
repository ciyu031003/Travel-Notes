import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ id: '0' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
