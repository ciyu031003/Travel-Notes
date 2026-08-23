'use client'

import { useState } from 'react'
import { Camera, Images, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { pickPhotoFromCamera, addPhotoToAlbum } from '@/lib/modules/offline/media-upload'
import { isNativePlatform } from '@/lib/modules/offline/platform'

/**
 * 相册「添加照片」（移动端模块内入口，C1b）：
 * 原生壳：拍照/相册选图 → 本地落盘 + 入队 UPLOAD_MEDIA（离线待传，联网自动上传云端）。
 * Web 不渲染（后台 /admin/albums 已有上传）。
 */
export default function AddPhotoButton({
  albumId,
  onAdded,
}: {
  albumId: number | string
  onAdded?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 仅原生端显示；albumId 非数字（本地新建未同步）时禁用
  if (!isNativePlatform()) return null
  const canUpload = typeof albumId === 'number' && Number.isFinite(albumId)

  const handlePick = async (source: 'camera' | 'photos') => {
    setOpen(false)
    setBusy(true)
    setMessage(null)
    try {
      const photo = await pickPhotoFromCamera(source)
      if (!photo) {
        setMessage({ type: 'err', text: '未获取到图片' })
        return
      }
      const r = await addPhotoToAlbum({ albumId: Number(albumId), photo })
      if (r.ok) {
        setMessage({ type: 'ok', text: r.local ? '已保存到本地，联网后自动上传' : '照片已上传' })
        onAdded?.()
      } else {
        setMessage({ type: 'err', text: r.error || '添加失败' })
      }
    } catch {
      setMessage({ type: 'err', text: '操作失败，请重试' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => canUpload && setOpen(true)}
        disabled={!canUpload || busy}
        title={canUpload ? '添加照片' : '相册同步后才能添加照片'}
        className="absolute right-1.5 top-1.5 z-10 flex h-9 min-w-9 items-center justify-center rounded-full bg-black/50 p-2 text-album-warm backdrop-blur transition hover:bg-black/70 disabled:opacity-40"
        aria-label="添加照片"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-album-bg2 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-zpix font-bold text-album-accent">添加照片</h3>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full p-2 text-album-warm/60 hover:bg-white/10" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handlePick('camera')}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-3 py-4 text-album-text hover:border-album-accent"
              >
                <Camera className="h-6 w-6 text-album-accent" />
                <span className="text-sm">拍照</span>
              </button>
              <button
                type="button"
                onClick={() => handlePick('photos')}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-3 py-4 text-album-text hover:border-album-accent"
              >
                <Images className="h-6 w-6 text-album-accent" />
                <span className="text-sm">相册选择</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-[140] flex justify-center px-4">
          <p
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs shadow-lg backdrop-blur ${
              message.type === 'ok' ? 'bg-emerald-900/80 text-emerald-200' : 'bg-red-900/80 text-red-200'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            {message.text}
          </p>
        </div>
      )}
    </>
  )
}
