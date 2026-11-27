'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { ArrowLeft, Camera, Check, Loader2, X } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalTravelBySlug } from '@/lib/modules/offline/travel-read'
import { createMemory } from '@/lib/modules/offline/memory-write'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { travelDetailHref } from '@/lib/routes'
import { base64ToBytes, extFromMime, pickImage, type PickedImage } from '@/lib/media/pick-image'
import './record.css'

interface TravelInfo {
  id: number | string
  title: string
  slug: string
  spaceId: number | null
  /** 本地尚未同步到云端时不能提交（服务端不知道这本书） */
  pendingSync?: boolean
}

const MOODS = ['开心', '幸福', '想念', '期待', '平静', '累']
const MAX_PHOTOS = 9

/** 缓动与 app/motion-tokens.css 的 --motion-ease-* 一致 */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1]

/**
 * 「记录此刻」独立页（旧入口，保留兼容）。
 *
 * 本轮补齐了它最大的能力缺口：**照片**。
 * 此前这一页只有标题 / 正文 / 心情，完全不收照片，导致同一个产品里
 * 「记一笔」（TravelDetail 的 MemoryComposer，能传照片）与「记录今日」（本页，不能传）
 * 两套入口能力不一致 —— 用户从"记录今日"进来传不了图，自然会觉得"没有上传入口"。
 *
 * 上传依赖云端回忆 id：先建回忆，再 POST /api/memories/:id/photos（与记一笔同一管线）。
 * 离线本地写入拿不到 id，此时如实告知"照片会在同步后补传"，不假装成功。
 *
 * ── 体验精修（1.30.18）────────────────────────────────────────────────────
 * 与「新建旅行」共用同一套动效语言（motion + motion-tokens）：
 *   · 进入：顶栏先落，三段表单 50ms 错峰上浮（reduced-motion 下无位移）；
 *   · 照片：新增缩放入场、删除淡出，刚加的那张闪一圈光环（760ms 自动回收）；
 *   · 心情：按压回弹 + 选中态过渡；
 *   · 提交：按钮内不定进度条 + 旋转指示器，文案走 aria-live；
 *   · 成功：勾弹出 + 卡片上浮，随后整页淡出再回旅行详情（衔接不闪白）；
 *   · 错误：role="alert" + 淡入，键盘与读屏都能拿到。
 */
export default function TravelRecordPage({ slugProp = '' }: { slugProp?: string }) {
  const params = useParams<{ slug: string }>()
  /**
   * slug 归一化（1.30.18 修复）
   *
   * App Router 的 useParams() 返回的是**已经 URL 编码**过的路由段
   * （例如 青铜峡-3-日 → %E9%9D%92%E9%93%9C%E5%B3%A1-3-%E6%97%A5）。
   * 下面请求 by-slug 时还会再 encodeURIComponent 一次，于是变成
   * %25E9... 二次编码 → /api/travels/by-slug 404 → 页面显示「旅行不存在」。
   * 而旅行 slug 基本都由中文标题生成（旅行详情页自己会解码，所以只是这一页坏），
   * 表现为：从「记录今日」进来十个里有九个是"旅行不存在"。
   * 这里先解码回真实 slug，后续 encode 才是对的；纯 ASCII slug 解码后不变。
   */
  const rawSlug = slugProp || params.slug || ''
  const slug = (() => {
    if (!rawSlug) return ''
    try {
      return decodeURIComponent(rawSlug)
    } catch {
      return rawSlug
    }
  })()
  const router = useRouter()
  const reduce = useReducedMotion() === true
  const [travel, setTravel] = useState<TravelInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('')
  const [photos, setPhotos] = useState<PickedImage[]>([])
  const [newPhotoId, setNewPhotoId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [offline, setOffline] = useState(false)
  /** 成功后的"淡出再走"：先播 240ms 淡出，再 push 详情，避免白屏闪一下 */
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    readWithFallback<TravelInfo | null>(
      async () => {
        const res = await fetch(apiUrl('/api/travels/by-slug/' + encodeURIComponent(slug)), { credentials: 'include' })
        if (!res.ok) throw new Error('http ' + res.status)
        const data = await res.json()
        return data.travel || null
      },
      async () => {
        const local = await readLocalTravelBySlug(slug)
        return local
      },
    )
      .then((result) => {
        if (cancelled) return
        setTravel(result.data)
        setOffline(result.source === 'local')
      })
      .catch(() => {
        if (!cancelled) setTravel(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // 新照片的光环自动回收
  useEffect(() => {
    if (!newPhotoId) return
    const t = window.setTimeout(() => setNewPhotoId(null), 760)
    return () => window.clearTimeout(t)
  }, [newPhotoId])

  const addPhotos = async () => {
    const p = await pickImage('photos')
    if (!p) return
    setPhotos((prev) => [...prev, p].slice(0, MAX_PHOTOS))
    setNewPhotoId(p.id)
  }

  /** 成功提示停留多久再回详情（淡出另算 240ms） */
  const goBackSoon = (delay: number) => {
    window.setTimeout(() => {
      setLeaving(true)
      window.setTimeout(() => router.push(travelDetailHref(slug)), reduce ? 0 : 240)
    }, delay)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const travelId = Number(travel!.id)
      if (!Number.isFinite(travelId)) {
        setError('该旅行尚未同步到云端，暂时无法记录')
        setSubmitting(false)
        return
      }
      setProgress('正在保存…')
      const r = await createMemory({
        travelId,
        title,
        content: content || undefined,
        mood: mood || undefined,
      })
      if (!r.ok) {
        setError(r.error || '保存失败')
        return
      }

      // 照片：与「记一笔」共用同一上传接口
      if (photos.length > 0) {
        if (r.local || !r.id) {
          setSuccess('文字已存到本地；照片会在联网同步后补传')
          goBackSoon(1600)
          return
        }
        setProgress('正在上传 ' + photos.length + ' 张照片…')
        const form = new FormData()
        for (const p of photos) {
          const bytes = base64ToBytes(p.base64)
          form.append(
            'files',
            new Blob([bytes as unknown as BlobPart], { type: p.mimeType }),
            'photo-' + p.id + '.' + extFromMime(p.mimeType),
          )
        }
        const up = await fetch(apiUrl('/api/memories/' + r.id + '/photos'), {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
        if (!up.ok) {
          setSuccess('文字已保存，照片上传失败，可在旅行相册里重传')
          goBackSoon(1600)
          return
        }
      }

      setSuccess(isNativePlatform() && !navigator.onLine ? '已保存到本地，联网后自动上传' : '已保存，即将返回…')
      goBackSoon(1200)
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSubmitting(false)
      setProgress('')
    }
  }

  /** 三段表单的错峰入场（reduced-motion：无位移、瞬时） */
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.05, delayChildren: reduce ? 0 : 0.06 } },
  }
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.32, ease: EASE_OUT } },
  }

  if (loading) {
    return (
      <div className="container-custom py-20 text-center text-travel-sand">
        <Icon icon={Loader2} size="lg" className="rc-spin mx-auto mb-3" />
        加载中...
      </div>
    )
  }

  if (!travel) {
    return <div className="container-custom py-20 text-center text-travel-sand">旅行不存在</div>
  }

  return (
    <motion.div
      className="min-h-dvh overflow-x-hidden bg-[var(--m-bg)] pb-[calc(112px+env(safe-area-inset-bottom))] text-[var(--m-text)]"
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: reduce ? 0 : 0.24, ease: EASE_IN }}
    >
      <motion.header
        className="m2-topbar"
        initial={{ opacity: 0, y: reduce ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
      >
        <div className="m2-navbar">
          <span className="m2-navbar-side">
            <Link
              href={travelDetailHref(slug)}
              aria-label="返回旅行"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--m-text)]"
            >
              <Icon icon={ArrowLeft} size="md" />
            </Link>
          </span>
          <h1 className="m2-navbar-title">记录此刻</h1>
          <span className="m2-navbar-side" aria-hidden="true" />
        </div>
      </motion.header>

      <main className="px-[18px] pt-4">
        <p className="mb-4 text-[13px] text-[var(--m-faint)]">{travel.title}</p>

        {offline && (
          <div className="mb-4 rounded-[12px] bg-[var(--m-tone-sun-bg)] px-4 py-2.5 text-center text-[13px] font-semibold text-[var(--m-tone-sun-fg)]">
            离线模式：保存的内容会先存到本地，联网后自动上传
          </div>
        )}

        {success ? (
          <motion.div
            className="m2-card rc-success flex flex-col items-center gap-3 p-8 text-center"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 26 }}
          >
            <motion.span
              className="m2-icon-box m2-tone-mint flex h-14 w-14 items-center justify-center rounded-[16px]"
              initial={{ scale: reduce ? 1 : 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 22, delay: 0.08 }}
            >
              <Icon icon={Check} size="lg" />
            </motion.span>
            <p className="text-[15px] font-semibold text-[var(--m-text)]">{success}</p>
          </motion.div>
        ) : travel.pendingSync ? (
          <div className="m2-card p-8 text-center text-[13px] leading-6 text-[var(--m-muted)]">
            这本旅行还在本地待同步
          </div>
        ) : (
          <motion.form
            onSubmit={submit}
            className="space-y-4"
            variants={container}
            initial="hidden"
            animate="show"
          >
            <motion.section className="m2-form-section" variants={item}>
              <h2 className="m2-form-section-title">这一刻</h2>
              <div>
                <label htmlFor="record-title" className="mb-2 block text-[13px] font-semibold text-[var(--m-muted)]">
                  标题
                </label>
                <input
                  id="record-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={255}
                  placeholder="比如：今天看到的海"
                  className="m2-input"
                />
              </div>
              <div>
                <label htmlFor="record-content" className="mb-2 block text-[13px] font-semibold text-[var(--m-muted)]">
                  写点什么
                </label>
                <textarea
                  id="record-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  placeholder="此刻的心情、发生的事…"
                  className="m2-input resize-none"
                  style={{ minHeight: 132 }}
                />
              </div>
            </motion.section>

            <motion.section className="m2-form-section" variants={item}>
              <h2 className="m2-form-section-title">
                照片
                <span className="ml-auto text-[11px] font-normal text-[var(--m-faint)]">最多 {MAX_PHOTOS} 张</span>
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <AnimatePresence initial={false}>
                  {photos.map((p, i) => (
                    <motion.div
                      key={p.id}
                      layout={reduce ? false : 'position'}
                      initial={{ opacity: 0, scale: reduce ? 1 : 0.86 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: reduce ? 1 : 0.9 }}
                      transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
                      className="relative aspect-square overflow-hidden rounded-[12px]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={'data:' + p.mimeType + ';base64,' + p.base64} alt="" width={400} height={400} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      {p.id === newPhotoId && <span className="rc-photo-fx" aria-hidden="true" />}
                      <button
                        type="button"
                        aria-label="移除这张照片"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="rc-photo-x absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full"
                      >
                        <Icon icon={X} size="sm" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {photos.length < MAX_PHOTOS && (
                  <motion.button
                    type="button"
                    onClick={addPhotos}
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-[var(--m-line-strong)] text-[var(--m-faint)]"
                  >
                    <Icon icon={Camera} size="md" />
                    <span className="text-[11px]">添加照片</span>
                  </motion.button>
                )}
              </div>
            </motion.section>

            <motion.section className="m2-form-section" variants={item}>
              <h2 className="m2-form-section-title">此刻心情</h2>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(mood === m ? '' : m)}
                    aria-pressed={mood === m}
                    className={
                      'rc-mood min-h-[44px] rounded-full border px-4 text-[13px] font-semibold ' +
                      (mood === m
                        ? 'border-transparent bg-[var(--m-grad-cta)] text-white'
                        : 'border-[var(--m-line-strong)] bg-[var(--m-surface-solid)] text-[var(--m-muted)]')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </motion.section>

            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  key="record-error"
                  role="alert"
                  aria-live="assertive"
                  initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                  className="rounded-[12px] bg-[var(--m-danger)]/10 px-4 py-3 text-[13px] font-semibold text-[var(--m-danger)]"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="m-btn m-btn-primary m-btn-lg m-btn-block rc-submit"
            >
              {submitting ? (
                <>
                  <span className="m-btn-spinner" aria-hidden="true" />
                  <span aria-live="polite">{progress || '保存中...'}</span>
                </>
              ) : (
                <>
                  <Icon icon={Check} size="sm" />
                  保存回忆
                </>
              )}
              {submitting && (
                <span className="rc-submit-load" aria-hidden="true">
                  <span className="rc-submit-load-bar" />
                </span>
              )}
            </button>
          </motion.form>
        )}
      </main>
    </motion.div>
  )
}
