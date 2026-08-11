import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import MomentTimeline from '@/components/moments/MomentTimeline'

export const metadata: Metadata = {
  title: '碎碎念 | 生活随记',
  description: '生活中的灵感、随想与碎碎念',
}

export const revalidate = 120

export default function MomentsPage() {
  return (
    <div className="container-custom">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/30 text-rose-500 dark:text-rose-300 rounded-full text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            <span>碎碎念</span>
          </div>
          <h1 className="text-3xl font-bold mb-3 text-gray-900 dark:text-gray-100">
            生活随记
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            记录生活里的灵感、随想和值得收藏的瞬间
          </p>
        </header>

        <MomentTimeline />
      </div>
    </div>
  )
}
