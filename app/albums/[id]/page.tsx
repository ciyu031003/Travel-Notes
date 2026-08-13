'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Image as ImageIcon } from 'lucide-react'

interface MediaItem {
  id: number
  url: string
  mimeType: string
  width: number | null
  height: number | null
  createdAt: string
}

interface Album {
  id: number
  title: string
  description: string | null
  mediaCount: number
  media: MediaItem[]
}

export default function AlbumDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [album, setAlbum] = useState<Album | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/albums/${params.id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setAlbum(data.album || null))
      .catch(() => setAlbum(null))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="container-custom py-16 text-center text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-rose-400" />
        加载中...
      </div>
    )
  }

  if (!album) {
    return (
      <div className="container-custom py-16 text-center text-gray-500">
        <p className="mb-4">相册不存在</p>
        <Link href="/albums" className="text-rose-500 hover:underline">返回相册列表</Link>
      </div>
    )
  }

  return (
    <div className="container-custom py-10 md:py-14">
      <button
        type="button"
        onClick={() => router.push('/albums')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-rose-500 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回相册列表
      </button>

      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">{album.title}</h1>
        {album.description && (
          <p className="text-gray-500 dark:text-gray-400 mt-1">{album.description}</p>
        )}
        <p className="text-sm text-gray-400 mt-2">{album.mediaCount} 张照片</p>
      </header>

      {album.media.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 text-rose-200" />
          这个相册还没有照片
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {album.media.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setLightbox(m.id)}
              className="group relative block aspect-square overflow-hidden rounded-xl shadow-sm hover:shadow-lg transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && album.media.some((m) => m.id === lightbox) && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={album.media.find((m) => m.id === lightbox)!.url}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  )
}
