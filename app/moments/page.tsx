import type { Metadata } from 'next'
import { Sparkles, Settings2 } from 'lucide-react'
import MomentsContent from '@/components/moments/MomentsContent'
import ManageEntry from '@/components/layout/ManageEntry'

export const metadata: Metadata = {
  title: '碎碎念 | 生活随记',
  description: '生活中的灵感、随想与碎碎念',
}

export default function MomentsPage() {
  return (
    <div className="container-custom">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-end mb-4">
          <ManageEntry
            href="/admin/moments"
            label="管理碎碎念"
            icon={<Settings2 className="w-3.5 h-3.5" />}
            className="px-3 py-1.5 rounded-full text-sm text-travel-sand dark:text-shell-muted hover:text-travel-accent dark:hover:text-travel-accentSoft hover:bg-travel-sakura/50 dark:hover:bg-travel-accent/15 transition-colors"
          />
        </div>

        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-travel-sakura/50 dark:bg-travel-accent/20 text-travel-accent dark:text-travel-accentSoft rounded-full text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            <span>碎碎念</span>
          </div>
          <h1 className="text-3xl font-bold mb-3 text-travel-inkStrong dark:text-shell-text">
            生活随记
          </h1>
          <p className="text-travel-sand dark:text-shell-muted max-w-md mx-auto">
            记录生活里的灵感、随想和值得收藏的瞬间
          </p>
        </header>

        <MomentsContent />
      </div>
    </div>
  )
}

