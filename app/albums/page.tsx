'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Image as ImageIcon, Loader2, Images, Lock } from 'lucide-react'
import AlbumUnlockModal from '@/components/AlbumUnlockModal'

interface Album {
  id: number
  title: string
  description: string | null
  coverUrl: string | null
  mediaCount: number
  date: string | null
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [showUnlock, setShowUnlock] = useState(false)

  const loadAlbums = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/albums')
      if (res.status === 403) {
        setLocked(true)
        setShowUnlock(true)
        setAlbums([])
        return
      }
      const data = await res.json()
      setAlbums(data.albums || [])
      setLocked(false)
    } catch {
      // 网络异常时保持空态，不误显示上锁
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlbums()
  }, [])

  return (
    <div className="container-custom py-10 md:py-14">
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/30 text-rose-500 dark:text-rose-300 rounded-full text-sm mb-4">
          <Images className="w-4 h-4" />
          <span>纪念相册</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100">我们的相册</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">按主题收藏每一次旅行的照片</p>
      </header>

      {loading ? (
        <div className="text-center py-16 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-rose-400" />
          加载中...
        </div>
      ) : locked ? (
        <div className="card p-12 text-center text-gray-500">
          <Lock className="w-10 h-10 mx-auto mb-3 text-rose-200" />
          <p>相册已上锁，请先解锁</p>
          <button
            type="button"
            onClick={() => setShowUnlock(true)}
            className="mt-4 px-5 py-2 bg-rose-500 text-white rounded-full text-sm hover:bg-rose-600 transition-colors"
          >
            解锁相册
          </button>
        </div>
      ) : albums.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 text-rose-200" />
          <p>还没有相册</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {albums.map((album) => (
            <Link
              key={album.id}
              href={`/albums/${album.id}`}
              className="group relative block aspect-square overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all hover:-translate-y-1"
            >
              {album.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <Image
                  src={album.coverUrl}
                  alt={album.title}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-white/70" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h2 className="text-white font-semibold drop-shadow">{album.title}</h2>
                <p className="text-white/80 text-xs mt-0.5">{album.mediaCount} 张照片</p>
                {album.description && (
                  <p className="text-white/70 text-xs mt-1 line-clamp-1">{album.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <AlbumUnlockModal
        isOpen={showUnlock}
        onClose={() => setShowUnlock(false)}
        redirectToAlbum={false}
        onSuccess={() => {
          setShowUnlock(false)
          loadAlbums()
        }}
      />
    </div>
  )
}
