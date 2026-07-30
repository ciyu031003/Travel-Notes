import { NextResponse } from 'next/server'
import { getPostService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import { findCityByName } from '@/data/cities'
import { verifyAlbumToken, ALBUM_COOKIE } from '@/lib/album-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie') || ''
  const tokenMatch = cookieHeader.match(new RegExp(`${ALBUM_COOKIE}=([^;]+)`))
  const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : undefined

  const isValid = await verifyAlbumToken(token)
  if (!isValid) {
    return NextResponse.json({ error: '相册已上锁，请先在登录页解锁' }, { status: 403 })
  }

  try {
    const postService = getPostService()
    const posts = await postService.getPostsHybrid('travel')

    const cityMap = new Map<
      string,
      {
        name: string
        province: string
        provinceId: string
        images: string[]
        date: string
        postSlug: string
      }
    >()

    for (const post of posts) {
      if (!post.location) continue

      const city = findCityByName(post.location)
      const province = findProvinceByLocation(post.location)
      if (!city) continue

      const images: string[] = []
      if (post.cover) images.push(post.cover)
      if (post.images && post.images.length > 0) {
        for (const img of post.images) {
          if (!images.includes(img)) images.push(img)
        }
      }

      if (images.length === 0) continue

      const key = city.name
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          name: city.name,
          province: province?.name || '',
          provinceId: province?.id || '',
          images,
          date: post.date,
          postSlug: post.slug,
        })
      } else {
        const existing = cityMap.get(key)!
        for (const img of images) {
          if (!existing.images.includes(img)) existing.images.push(img)
        }
      }
    }

    const cities = Array.from(cityMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    return NextResponse.json({
      cities,
      totalPosts: posts.length,
    })
  } catch (error) {
    console.error('[Album API] Failed:', error)
    return NextResponse.json({ error: '获取相册数据失败' }, { status: 500 })
  }
}
