'use client'

import { useMemo, useState } from 'react'
import { Camera, ImagePlus, Upload, X } from 'lucide-react'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Icon } from '@/components/mobile/Icon'
import { Loader } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { base64ToBytes, extFromMime, pickImage, type PickedImage } from '@/lib/media/pick-image'
import { dayFullLabel, mediaKeyOf } from './format'
import type { TimelineDay, ViewerPhotoLike } from './types'

/**
 * 「相册」tab —— 旅行照片的**上传入口**。
 *
 * 真机反馈「旅行完以后，上传图片的入口也找不到」。此前唯一的传图路径藏在
 * 「记一笔」抽屉里（必须先写标题才建回忆），而且整页还被全屏相册盖住。
 * 这里给出无需写字的一步上传：选天 → 选照片（最多 9 张）→ 上传。
 *
 * 上传落到该天的「旅行照片」容器回忆（见 `POST /api/travels/:id/photos`），
 * 于是时间线、画册、封面统计都能看见。
 */
export default function TravelAlbumTab({
  travelId,
  days,
  loading,
  coverMediaId,
  extraImages,
  onChanged,
  onOpenViewer,
}: {
  travelId: number
  days: TimelineDay[]
  loading: boolean
  coverMediaId?: number | null
  /** 旅行级图片（封面 / 旧文章图），不属于任何"天" */
  extraImages: string[]
  onChanged: () => void
  onOpenViewer: (photos: ViewerPhotoLike[], index: number) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [picked, setPicked] = useState<PickedImage[]>([])
  const [targetDayId, setTargetDayId] = useState<number | null>(days[0]?.id ?? null)

  /** 逐天照片（时间线已按天聚合去重） */
  const dayGroups = useMemo(
    () => days.map((d, i) => ({ day: d, index: i, photos: d.photos })).filter((g) => g.photos.length > 0),
    [days],
  )
  /** 已被"天"覆盖的媒体 key：旅行级图片里要排除它们，否则同一张图会出现两次（大小变体 URL 不同） */
  const dayMediaKeys = useMemo(
    () => new Set(days.flatMap((d) => d.photos.map((p) => mediaKeyOf(p.url)))),
    [days],
  )
  const restImages = useMemo(
    () => extraImages.filter((u) => !dayMediaKeys.has(mediaKeyOf(u))),
    [extraImages, dayMediaKeys],
  )
  const allPhotos = useMemo<ViewerPhotoLike[]>(
    () => [
      ...dayGroups.flatMap((g) => g.photos.map((p) => ({ id: p.id, url: p.url }))),
      ...restImages.map((url) => ({ url })),
    ],
    [dayGroups, restImages],
  )
  const total = allPhotos.length

  const addPhotos = async () => {
    const p = await pickImage('photos')
    if (!p) return
    setPicked((prev) => [...prev, p].slice(0, 9))
  }

  const doUpload = async () => {
    if (picked.length === 0) {
      toast.error('先选几张照片')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      for (const p of picked) {
        const bytes = base64ToBytes(p.base64)
        form.append(
          'files',
          new Blob([bytes as unknown as BlobPart], { type: p.mimeType }),
          `photo-${p.id}.${extFromMime(p.mimeType)}`,
        )
      }
      if (targetDayId != null) form.append('travelDayId', String(targetDayId))
      const res = await fetch(apiUrl(`/api/travels/${travelId}/photos`), {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '上传失败')
      toast.success(`已上传 ${j.mediaIds?.length ?? picked.length} 张`)
      setPicked([])
      setShowUpload(false)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader />
      </div>
    )
  }

  return (
    <div className="pb-4">
      {/* 上传主入口：始终可见，不等有照片才出现 */}
      <div className="flex items-center gap-2">
        <Button icon={Upload} onClick={() => setShowUpload(true)}>
          上传照片
        </Button>
        <span className="text-[13px] text-[var(--m-muted)]">共 {total} 张</span>
      </div>

      {total === 0 ? (
        <div className="m-card mt-4 px-5 py-10 text-center">
          <Icon icon={Camera} size="lg" tone="faint" className="mx-auto" />
          <p className="mt-3 text-sm text-[var(--m-muted)]">还没有照片</p>
          <p className="mt-1 text-xs text-[var(--m-faint)]">把这次旅行的照片传上来，画册会自动排版</p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {dayGroups.map((g) => (
            <section key={g.day.id}>
              <div className="m-section-title">
                <span>{dayFullLabel(g.day.date, g.index)}</span>
                <span className="text-xs text-[var(--m-muted)]">{g.photos.length} 张</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {g.photos.map((p) => {
                  const index = allPhotos.findIndex((x) => x.id === p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenViewer(allPhotos, Math.max(0, index))}
                      className="relative aspect-square overflow-hidden rounded-xl bg-[var(--m-surface-2)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {coverMediaId === p.id && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
                          封面
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}

          {restImages.length > 0 && (
            <section>
              <div className="m-section-title">
                <span>其他照片</span>
                <span className="text-xs text-[var(--m-muted)]">{restImages.length} 张</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {restImages.map((url, i) => {
                  const index = allPhotos.findIndex((x) => x.url === url)
                  return (
                    <button
                      key={url + i}
                      type="button"
                      onClick={() => onOpenViewer(allPhotos, Math.max(0, index))}
                      className="relative aspect-square overflow-hidden rounded-xl bg-[var(--m-surface-2)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      <BottomSheet open={showUpload} onClose={() => setShowUpload(false)} title="上传照片">
        <div className="space-y-4">
          {days.length > 1 && (
            <div>
              <p className="m-field-label">加到哪一天</p>
              <div className="-mx-1 mt-1.5 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d, i) => {
                  const active = d.id === targetDayId
                  return (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTargetDayId(d.id)}
                      className={'m-chip shrink-0 ' + (active ? 'm-chip-active' : '')}
                    >
                      {dayFullLabel(d.date, i)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {picked.map((p, i) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:${p.mimeType};base64,${p.base64}`} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="移除这张照片"
                  onClick={() => setPicked((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white active:scale-95"
                >
                  <Icon icon={X} size="sm" />
                </button>
              </div>
            ))}
            {picked.length < 9 && (
              <button
                type="button"
                onClick={addPhotos}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--m-line)] text-[var(--m-faint)] active:scale-95"
              >
                <Icon icon={ImagePlus} size="md" />
                <span className="text-[11px]">添加照片</span>
              </button>
            )}
          </div>
          <p className="m-caption text-[var(--m-faint)]">一次最多 9 张；上传后可在沉浸视图里点「设为封面」</p>

          <Button block size="lg" loading={uploading} icon={uploading ? undefined : Upload} onClick={doUpload}>
            {uploading ? '上传中…' : `上传 ${picked.length} 张`}
          </Button>
        </div>
      </BottomSheet>

    </div>
  )
}
