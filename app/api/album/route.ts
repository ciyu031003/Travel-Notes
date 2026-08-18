import { NextResponse } from 'next/server'
import { getPostService } from '@/lib/container'
import { listAlbums } from '@/lib/modules/album/album.service'
import { findProvinceByLocation } from '@/lib/province-map'
import { findCityByName } from '@/data/cities'
import { verifyAlbumToken, ALBUM_COOKIE } from '@/lib/album-auth'
import { getCurrentUserId } from '@/lib/current-user'

export const dynamic = 'force-dynamic'

interface CityDay {
  date: string
  title: string
  images: string[]
}

interface CityAlbumPayload {
  name: string
  province: string
  provinceId: string
  images: string[]
  date: string
  postSlug: string
  days: CityDay[]
}

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
    const userId = await getCurrentUserId()
    const posts = await postService.getPostsHybrid('travel', userId)

    const cityMap = new Map<string, CityAlbumPayload>()

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
      const day: CityDay = {
        date: post.date,
        title: post.title || `旅行记录`,
        images,
      }

      if (!cityMap.has(key)) {
        cityMap.set(key, {
          name: city.name,
          province: province?.name || '',
          provinceId: province?.id || '',
          images: [...images],
          date: post.date,
          postSlug: post.slug,
          days: [day],
        })
      } else {
        const existing = cityMap.get(key)!
        for (const img of images) {
          if (!existing.images.includes(img)) existing.images.push(img)
        }
        const sameDay = existing.days.find((d) => d.date === post.date)
        if (sameDay) {
          for (const img of images) {
            if (!sameDay.images.includes(img)) sameDay.images.push(img)
          }
        } else {
          existing.days.push(day)
        }
      }
    }

    // 每个城市的 DAY 按日期升序排列（从旅行第一天到最后一天）
    for (const city of Array.from(cityMap.values())) {
      city.days.sort((a: CityDay, b: CityDay) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }

    const cities = Array.from(cityMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    const albums = await listAlbums(userId)

    return NextResponse.json({
      cities,
      albums,
      totalPosts: posts.length,
    })
  } catch (error) {
    console.error('[Album API] Failed:', error)
    return NextResponse.json({ error: '获取相册数据失败' }, { status: 500 })
  }
}


