import type { Metadata } from 'next'
import { Sparkles, Settings2, Feather, Heart } from 'lucide-react'
import MomentsContent from '@/components/moments/MomentsContent'
import ManageEntry from '@/components/layout/ManageEntry'

export const metadata: Metadata = {
  title: '碎碎念 | 生活随记',
  description: '生活中的灵感、随想与碎碎念',
}

export default function MomentsPage() {
  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden">
      {/* 温暖氛围背景：柔和光斑与纸纹 */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(228,180,120,0.24),transparent)]" />
        <div className="absolute -left-24 top-40 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(156,199,178,0.28),transparent)]" />
        <div className="absolute -right-28 bottom-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(244,190,180,0.24),transparent)]" />
        <span className="absolute left-[12%] top-28 h-1.5 w-1.5 rounded-full bg-travel-bloom/60" />
        <span className="absolute right-[16%] top-16 h-2 w-2 rounded-full bg-travel-sakura/70" />
        <span className="absolute bottom-40 left-[8%] h-2 w-2 rounded-full bg-travel-bloom/50" />
      </div>

      <div className="container-custom">
        <div className="mx-auto max-w-2xl px-1 pb-16">
          <div className="mb-5 flex justify-end">
            <ManageEntry
              href="/admin/moments"
              label="管理碎碎念"
              icon={<Settings2 className="h-3.5 w-3.5" />}
              className="rounded-full px-3 py-1.5 text-sm text-travel-sand transition-colors hover:bg-travel-sakura/50 hover:text-travel-accent dark:text-shell-muted dark:hover:bg-travel-accent/15 dark:hover:text-travel-accentSoft"
            />
          </div>

          <header className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-travel-sakura/60 to-travel-bloom/30 px-4 py-1.5 text-sm font-medium text-travel-accent dark:from-travel-accent/25 dark:to-travel-bloom/20 dark:text-travel-accentSoft">
              <Feather className="h-4 w-4" />
              <span>碎碎念</span>
            </div>
            <h1 className="mx-auto mt-4 max-w-xl text-2xl font-bold leading-snug text-travel-inkStrong sm:text-3xl dark:text-shell-text">
              生活里那些值得被记住的柔软片刻
            </h1>
            <p className="mx-auto mt-3 flex max-w-md items-center justify-center gap-1.5 text-sm leading-6 text-travel-sand dark:text-shell-muted">
              <Heart className="h-3.5 w-3.5 shrink-0 text-travel-bloom" />
              一句话、一个小确幸、一次突然的想念，都可以放在这里
            </p>
          </header>

          <MomentsContent />
        </div>
      </div>
    </div>
  )
}
