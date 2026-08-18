'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  MapPin,
  Image as ImageIcon,
  Sparkles,
  Heart,
  BarChart3,
  Camera,
  TrendingUp,
} from 'lucide-react'
import ChinaMap from '@/components/ChinaMap'
import { formatDate } from '@/lib/utils'

export interface DashboardData {
  provinceStats: Array<{ name: string; count: number }>
  provincesVisitedCount: number
  travelCount: number
  totalPhotos: number
  momentCount: number
  totalLikes: number
  travelPosts: never[]
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  accent: string
  href?: string
}) {
  const inner = (
    <div className="card p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export default function DashboardClient({ data }: { data: DashboardData }) {
  const maxProvinceCount = useMemo(
    () => Math.max(1, ...data.provinceStats.map((p) => p.count)),
    [data.provinceStats]
  )

  const totalContent = data.travelCount

  return (
    <div className="container-custom py-10">
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-300 rounded-full text-sm mb-4">
          <BarChart3 className="w-4 h-4" />
          <span>数据看板</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">足迹与成长</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          走过的省份、写下的文字、记录的照片，都在这里
        </p>
      </header>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard
          icon={MapPin}
          label="点亮省份"
          value={data.provincesVisitedCount}
          accent="bg-gradient-to-br from-travel-accentSoft to-pink-500"
          href="/travel"
        />
        <StatCard
          icon={Camera}
          label="旅行照片"
          value={data.totalPhotos}
          accent="bg-gradient-to-br from-blue-400 to-indigo-500"
          href="/album"
        />
        <StatCard
          icon={TrendingUp}
          label="全部内容"
          value={totalContent}
          accent="bg-gradient-to-br from-amber-400 to-orange-500"
        />
        <StatCard
          icon={ImageIcon}
          label="旅行足迹"
          value={data.travelCount}
          accent="bg-gradient-to-br from-cyan-400 to-sky-500"
          href="/travel"
        />
        <StatCard
          icon={Sparkles}
          label="碎碎念"
          value={data.momentCount}
          accent="bg-gradient-to-br from-fuchsia-400 to-pink-500"
          href="/moments"
        />
        <StatCard
          icon={Heart}
          label="收到点赞"
          value={data.totalLikes}
          accent="bg-gradient-to-br from-red-400 to-travel-accent"
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* 中国地图 */}
        <div className="lg:col-span-3 card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-travel-accentSoft" />
            旅行足迹地图
          </h2>
          <div className="h-[420px] sm:h-[520px] lg:h-full">
            <ChinaMap posts={data.travelPosts as never} />
          </div>
        </div>

        {/* 省份打卡排行 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              省份打卡排行
            </h2>
            {data.provinceStats.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">还没有旅行记录</p>
            ) : (
              <div className="space-y-3">
                {data.provinceStats.slice(0, 10).map((p) => (
                  <div key={p.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-200">{p.name}</span>
                      <span className="text-gray-400 tabular-nums">{p.count} 篇</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#F5DCE0] to-[#E8B8C2] rounded-full transition-all duration-700"
                        style={{ width: `${(p.count / maxProvinceCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              内容构成
            </h2>
            <div className="space-y-2">
              {[
                { label: '旅行记录', value: data.travelCount, color: 'bg-travel-accentSoft' },
                { label: '旅行照片', value: data.totalPhotos, color: 'bg-blue-400' },
                { label: '碎碎念', value: data.momentCount, color: 'bg-purple-400' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.color} flex-shrink-0`} />
                  <span className="text-sm text-gray-600 dark:text-gray-300 flex-1">{item.label}</span>
                  <span className="text-sm text-gray-400 tabular-nums">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-400">
                最近更新：{data.travelPosts[0] ? formatDate((data.travelPosts[0] as { date: string }).date) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


