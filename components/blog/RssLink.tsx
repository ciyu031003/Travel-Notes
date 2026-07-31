import Link from 'next/link'
import { Rss } from 'lucide-react'

interface RssLinkProps {
  className?: string
}

export default function RssLink({ className }: RssLinkProps) {
  return (
    <Link
      href="/feed.xml"
      className={`inline-flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600 hover:scale-105 transition-all ${className ?? ''}`}
      title="RSS 订阅"
    >
      <Rss className="w-4 h-4" />
      <span>RSS 订阅</span>
    </Link>
  )
}
