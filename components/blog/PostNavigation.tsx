import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface PostNavItem {
  slug: string
  title: string
}

interface PostNavigationProps {
  prev?: PostNavItem | null
  next?: PostNavItem | null
  basePath: string
}

export default function PostNavigation({ prev, next, basePath }: PostNavigationProps) {
  if (!prev && !next) return null

  return (
    <nav className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12">
      {prev ? (
        <Link
          href={`${basePath}/${prev.slug}`}
          className="group rounded-xl p-5 border border-gray-100 bg-white hover:border-rose-200 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>上一篇</span>
          </div>
          <div className="text-sm font-medium text-gray-700 group-hover:text-rose-500 line-clamp-2 transition-colors">
            {prev.title}
          </div>
        </Link>
      ) : (
        <div className="hidden sm:block" aria-hidden="true" />
      )}

      {next ? (
        <Link
          href={`${basePath}/${next.slug}`}
          className="group rounded-xl p-5 border border-gray-100 bg-white hover:border-rose-200 hover:shadow-sm transition-all sm:text-right"
        >
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2 sm:justify-end">
            <span>下一篇</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <div className="text-sm font-medium text-gray-700 group-hover:text-rose-500 line-clamp-2 transition-colors">
            {next.title}
          </div>
        </Link>
      ) : (
        <div className="hidden sm:block" aria-hidden="true" />
      )}
    </nav>
  )
}
