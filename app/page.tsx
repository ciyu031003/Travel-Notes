import Link from 'next/link'
import { Heart, BookOpen, MapPin, Globe2, Sparkles, ArrowRight } from 'lucide-react'
import { getPosts } from '@/lib/content'
import { findProvinceByLocation } from '@/lib/province-map'

export const metadata = {
  title: '个人博客 | 旅行记录 & 学习笔记',
  description: '记录旅行足迹，分享学习笔记、思维导图和项目代码',
}

export default async function Home() {
  const travelPosts = await getPosts('travel')
  const blogPosts = await getPosts('tech/blog')

  const provincesVisited = new Set<string>()
  for (const post of travelPosts) {
    if (post.location) {
      const p = findProvinceByLocation(post.location)
      if (p) provincesVisited.add(p.id)
    }
  }

  const totalPosts = travelPosts.length + blogPosts.length

  return (
    <div className="relative min-h-screen bg-[#FAFBF7] text-[#3D4852]">
      {/* 底部雾气带 - 与旅行记录页一致 */}
      <div
        className="fixed inset-x-0 bottom-0 h-[40vh] pointer-events-none opacity-40"
        style={{
          background:
            'linear-gradient(to bottom, rgba(214,232,240,0) 0%, rgba(214,232,240,0.28) 50%, rgba(214,232,240,0.18) 100%)',
        }}
      />

      <div className="relative z-10">
        <section className="pt-24 pb-8 px-4">
          <div className="container-custom">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 text-[#3D4852] rounded-full text-sm mb-6">
                <Heart className="w-4 h-4 text-[#E8B8C2] fill-[#E8B8C2]" />
                <span>记录旅行 · 沉淀学习</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold mb-4 text-[#3D4852] leading-tight tracking-tight">
                <span className="text-[#3D4852]">走遍中国</span>
                <span className="block text-2xl md:text-3xl font-normal mt-2 text-[#3D4852]/80">
                  Travel & Study Journal
                </span>
              </h1>
              <p className="text-base md:text-lg text-[#3D4852]/80 max-w-xl mx-auto mb-8">
                记录旅行足迹，分享学习笔记 · 探索每一段美好时光
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3 mb-10">
              <div className="flex items-center gap-2 px-4 py-2 bg-[#FAFBF7] border border-[#D8DDD8]/80 rounded-full text-sm">
                <Globe2 className="w-4 h-4 text-[#E8B8C2]" />
                <span>{provincesVisited.size} 个省份</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-[#FAFBF7] border border-[#D8DDD8]/80 rounded-full text-sm">
                <MapPin className="w-4 h-4 text-[#E8B8C2]" />
                <span>{travelPosts.length} 篇旅行记录</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-[#FAFBF7] border border-[#D8DDD8]/80 rounded-full text-sm">
                <Sparkles className="w-4 h-4 text-[#E8B8C2]" />
                <span>{totalPosts} 篇文章</span>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-12">
          <div className="container-custom">
            <Link
              href="/travel"
              className="group block relative overflow-hidden rounded-3xl shadow-xl border border-[#D8DDD8]/60 bg-[#FAFBF7] hover:shadow-2xl transition-shadow"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#F5DCE0]/30 via-[#D6E8F0]/20 to-[#FAFBF7]/30" />
              <div className="relative z-10 p-8 md:p-12 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#F5DCE0]/40 border border-[#E8B8C2]/50 text-[#3D4852] rounded-full text-sm mb-4">
                  <MapPin className="w-3.5 h-3.5 text-[#E8B8C2]" />
                  <span>中国旅行地图</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-[#3D4852] mb-3">
                  点击进入旅行地图
                </h2>
                <p className="text-[#3D4852]/80 text-sm md:text-base max-w-md mx-auto mb-5">
                  交互式中国地图，点击高亮省份查看旅行记录
                </p>
                <div className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#3D4852] text-[#FAFBF7] rounded-full text-sm group-hover:bg-[#3D4852]/90 transition-colors">
                  <span>打开地图</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          </div>
        </section>

        <section className="px-4 pb-12">
          <div className="container-custom">
            <div className="grid md:grid-cols-3 gap-4">
              <Link
                href="/travel"
                className="group bg-[#FAFBF7] rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 border border-[#D8DDD8]/60"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <MapPin className="w-6 h-6 text-[#3D4852]" />
                </div>
                <h3 className="text-lg font-semibold text-[#3D4852] mb-2">
                  全部旅行记录
                </h3>
                <p className="text-sm text-[#3D4852]/80 mb-4">
                  浏览所有旅行文章，重温美好时光
                </p>
                <div className="flex items-center gap-2 text-[#E8B8C2] text-sm font-medium">
                  <span>查看全部</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                href="/notes"
                className="group bg-[#FAFBF7] rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 border border-[#D8DDD8]/60"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#D6E8F0] to-[#B8D4E3] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-6 h-6 text-[#3D4852]" />
                </div>
                <h3 className="text-lg font-semibold text-[#3D4852] mb-2">
                  学习笔记
                </h3>
                <p className="text-sm text-[#3D4852]/80 mb-4">
                  技术博客、思维导图、代码仓库
                </p>
                <div className="flex items-center gap-2 text-[#3D4852] text-sm font-medium">
                  <span>开始学习</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                href="/travel"
                className="group bg-[#FAFBF7] rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 border border-[#D8DDD8]/60"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-[#D4E8D4] to-[#A8D4A8] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Globe2 className="w-6 h-6 text-[#3D4852]" />
                </div>
                <h3 className="text-lg font-semibold text-[#3D4852] mb-2">
                  最新旅行
                </h3>
                <p className="text-sm text-[#3D4852]/80 mb-4">
                  {travelPosts.length > 0
                    ? `最新：${travelPosts[0].title}`
                    : '暂无旅行记录'}
                </p>
                <div className="flex items-center gap-2 text-[#3D4852] text-sm font-medium">
                  <span>继续探索</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 pb-16">
          <div className="container-custom">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-[#FAFBF7] rounded-2xl p-6 shadow-xl border border-[#D8DDD8]/60">
                <h3 className="text-lg font-semibold text-[#3D4852] mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#E8B8C2]" />
                  最近旅行
                </h3>
                <div className="space-y-3">
                  {travelPosts.slice(0, 4).map(post => (
                    <Link
                      key={post.slug}
                      href={`/travel/${post.slug}`}
                      className="block p-3 rounded-xl hover:bg-[#F5DCE0]/20 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[#3D4852] truncate">
                            {post.title}
                          </p>
                          <p className="text-xs text-[#3D4852]/70 mt-1 flex items-center gap-2">
                            <span>{new Date(post.date).toLocaleDateString('zh-CN')}</span>
                            {post.location && (
                              <>
                                <span>·</span>
                                <span>{post.location}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#D8DDD8] flex-shrink-0 mt-1" />
                      </div>
                    </Link>
                  ))}
                  {travelPosts.length === 0 && (
                    <p className="text-sm text-[#3D4852]/70 text-center py-4">暂无旅行记录</p>
                  )}
                </div>
              </div>

              <div className="bg-[#FAFBF7] rounded-2xl p-6 shadow-xl border border-[#D8DDD8]/60">
                <h3 className="text-lg font-semibold text-[#3D4852] mb-4 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#E8B8C2]" />
                  学习笔记
                </h3>
                <div className="space-y-3">
                  {blogPosts.slice(0, 4).map(post => (
                    <Link
                      key={post.slug}
                      href={`/notes/blog/${post.slug}`}
                      className="block p-3 rounded-xl hover:bg-[#D6E8F0]/20 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[#3D4852] truncate">
                            {post.title}
                          </p>
                          <p className="text-xs text-[#3D4852]/70 mt-1">
                            {new Date(post.date).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#D8DDD8] flex-shrink-0 mt-1" />
                      </div>
                    </Link>
                  ))}
                  {blogPosts.length === 0 && (
                    <p className="text-sm text-[#3D4852]/70 text-center py-4">暂无学习笔记</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="relative z-10 border-t border-[#D8DDD8]/50 py-8 px-4">
          <div className="container-custom text-center">
            <p className="flex items-center justify-center gap-1 text-[#3D4852]/80 text-sm">
              Made with <Heart className="w-4 h-4 text-[#E8B8C2] fill-[#E8B8C2]" /> by 袁同学 & 阿比旦
            </p>
            <p className="mt-1 text-[#3D4852]/60 text-xs">
              © {new Date().getFullYear()} All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
