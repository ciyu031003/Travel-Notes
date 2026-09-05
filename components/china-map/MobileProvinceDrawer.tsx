'use client'

import Link from 'next/link'
import Image from 'next/image'
import { X, MapPin, Sparkles, ChevronUp, ChevronDown, ChevronLeft } from 'lucide-react'
import { getProvince } from '@/data/provinces'
import { getCitiesByProvince, type City } from '@/data/cities'
import { travelDetailHref } from '@/lib/routes'
import type { PostMeta } from './types'

export default function MobileProvinceDrawer({
  postsByProvince,
  citiesWithPosts,
  provinceId,
  city,
  expanded,
  onToggleExpand,
  onClose,
  onCityClick,
  onBack,
}: {
  postsByProvince: Map<string, PostMeta[]>
  citiesWithPosts: Map<string, PostMeta[]>
  provinceId: string | null
  city: City | null
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
  onCityClick: (city: City) => void
  onBack: () => void
}) {
  if (!provinceId) return null
  const provinceInfo = getProvince(provinceId)
  if (!provinceInfo) return null

  const cities = getCitiesByProvince(provinceId)
  const provincePosts = postsByProvince.get(provinceId) || []
  const cityPosts = city ? citiesWithPosts.get(`${city.name}-${provinceId}`) || [] : []

  return (
    <>
      <div
        data-map-overlay
        className="fixed inset-0 z-40 bg-black/18 md:hidden"
        onClick={onClose}
      />

      <div
        data-map-overlay
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[26px] border-t border-[var(--m-line-strong)] bg-[var(--m-surface-solid)] shadow-[0_-18px_50px_-24px_rgba(20,14,8,0.35)] transition-[height] duration-300 ease-out md:hidden"
        style={{ height: expanded ? 'calc(100dvh - 56px)' : '62dvh' }}
      >
        {/* 拖拽把手：点击可切换全屏/半屏 */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? '收起为半屏' : '展开为全屏'}
            className="group inline-flex items-center gap-2 px-3 py-1.5"
          >
            <span className="h-1.5 w-12 rounded-full bg-[var(--m-faint)] transition group-active:scale-90" />
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </span>
          </button>
        </div>

        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-[var(--m-line)] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {city ? (
              <>
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]"
                  aria-label="返回省份"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <h3 className="truncate text-[18px] font-bold text-[var(--m-text)]">{city.name}</h3>
                  <p className="truncate text-xs text-[var(--m-muted)]">{city.nameEn} · {cityPosts.length} 条记录</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F6DFC4,#E4B478)] text-white">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-[18px] font-bold text-[var(--m-text)]">{provinceInfo.name}</h3>
                  <p className="truncate text-xs text-[var(--m-muted)]">{provinceInfo.nameEn} · {cities.length} 个城市</p>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--m-surface-2)] text-[var(--m-muted)]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(18px,env(safe-area-inset-bottom))]">
          {city ? (
            <CityPosts cityName={city.name} posts={cityPosts} />
          ) : (
            <>
              {provincePosts.length > 0 && (
                <section className="pt-4">
                  <div className="mb-3 flex items-center gap-2 text-xs text-[var(--m-muted)]">
                    <Sparkles className="h-4 w-4 text-[var(--m-accent)]" />
                    <span>该省旅行记录</span>
                    <span className="ml-auto rounded-full bg-[var(--m-accent-soft)] px-2.5 py-0.5 font-semibold text-[var(--m-accent-strong)]">
                      {provincePosts.length}
                    </span>
                  </div>
                  <PostList posts={provincePosts} />
                </section>
              )}

              <section className="pt-4">
                <div className="mb-3 flex items-center gap-2 text-xs text-[var(--m-muted)]">
                  <MapPin className="h-4 w-4 text-[var(--m-accent)]" />
                  <span>城市足迹</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {cities.map((c) => {
                    const key = `${c.name}-${provinceId}`
                    const count = citiesWithPosts.get(key)?.length || 0
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onCityClick(c)}
                        className={`flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition ${
                          count > 0
                            ? 'border-[var(--m-accent-soft)] bg-[var(--m-accent-soft)]/40'
                            : 'border-[var(--m-line)] bg-[var(--m-surface)]'
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          count > 0 ? 'bg-[linear-gradient(135deg,#E4B478,#C67A4E)] text-white' : 'bg-[var(--m-surface-2)] text-[var(--m-faint)]'
                        }`}>
                          <MapPin className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[var(--m-text)]">{c.name}</span>
                          <span className="block text-xs text-[var(--m-muted)]">{count > 0 ? `${count} 条记录` : '尚未抵达'}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function PostList({ posts }: { posts: PostMeta[] }) {
  if (posts.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--m-muted)]">还没有旅行记录</p>
  }
  return (
    <div className="space-y-2.5">
      {posts.map((post) => {
        const cover = post.cover || post.images?.[0]
        return (
          <Link
            key={post.slug}
            href={travelDetailHref(post.slug)}
            className="flex items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface)] p-2.5 transition active:scale-[0.99]"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--m-surface-2)]">
              {cover ? (
                <Image src={cover} alt={post.title} fill sizes="56px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <MapPin className="h-5 w-5 text-[var(--m-faint)]" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-[var(--m-text)]">{post.title}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--m-muted)]">{post.location || post.date}</p>
            </div>
            <ChevronUp className="h-4 w-4 shrink-0 rotate-90 text-[var(--m-faint)]" />
          </Link>
        )
      })}
    </div>
  )
}

function CityPosts({ cityName, posts }: { cityName: string; posts: PostMeta[] }) {
  return (
    <section className="pt-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--m-muted)]">
        <MapPin className="h-4 w-4 text-[var(--m-accent)]" />
        <span>{cityName} 的旅行记录</span>
      </div>
      <PostList posts={posts} />
    </section>
  )
}
