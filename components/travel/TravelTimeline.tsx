'use client'

import { useEffect, useState, useCallback } from 'react'
import { CalendarDays, Camera, Plus, Sparkles, Loader2, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { ItineraryChip } from '@/components/mobile/Pills'
import { toast } from '@/lib/mobile/toast-store'
import { addTravelDay } from '@/lib/modules/offline/travel-write'
import MemoryPhotoPicker from './MemoryPhotoPicker'
import ItineraryEditor from './ItineraryEditor'
import MemoryComposer from './MemoryComposer'

/**
 * 「添加一天」抽屉。
 *
 * 为什么需要：按天时间线是旅行记录的主结构，而此前**没有加天的入口** ——
 * 建旅行时没填日期、或路上想多记一天（出发前一夜 / 多待的一天）都无从下手，
 * 0 天时整块时间线还会直接消失。日期可选：留空即"还没定哪天"。
 */
export function AddDaySheet({
  travelId,
  onClose,
  onDone,
}: {
  travelId: number
  onClose: () => void
  onDone?: () => void
}) {
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const r = await addTravelDay({ travelId, date: date || null, title: title.trim() || undefined })
      if (!r.ok) throw new Error(r.error || '添加失败')
      toast.success(r.local ? '已加一天，联网后自动同步' : '已加一天')
      onDone?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="添加一天">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--m-surface-solid)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 shadow-[var(--m-shadow-lg)]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[17px] font-semibold text-[var(--m-text)]">添加一天</h3>
            <p className="mt-0.5 text-[12px] text-[var(--m-muted)]">日期可以不填，之后再补</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-2 text-[var(--m-muted)] active:scale-95">
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">日期</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[16px] text-[var(--m-text)] outline-none focus:border-[var(--m-accent)]"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">这一天的名字</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如 抵达乌鲁木齐（可选）"
              maxLength={60}
              className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[16px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-[var(--m-danger,#d9534f)]">
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--m-accent)] text-[15px] font-semibold text-[var(--m-on-accent)] transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Icon icon={Loader2} size="md" className="animate-spin" /> : <Icon icon={Plus} size="sm" />}
          {saving ? '添加中…' : '添加这一天'}
        </button>
      </div>
    </div>
  )
}

interface TimelineDay {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: { id: number; title: string; startTime: string | null; endTime: string | null; type: string; notes: string | null; locationName: string | null }[]
  memories: { id: number; title: string; content: string | null; mood: string | null; happenedAt: string | null; photos: { id: number; url: string }[] }[]
  photos: { id: number; url: string }[]
}

const MOOD_LABEL: Record<string, string> = {
  开心: '开心', 幸福: '幸福', 想念: '想念', 期待: '期待', 平静: '平静', 累: '累了',
}

function formatDay(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}

/**
 * v3.1 M1-A4：旅行按天叙事时间线（天=章节：日期 → 行程 → 照片 → 回忆）。
 */
export default function TravelTimeline({ travelId }: { travelId: number }) {
  const [days, setDays] = useState<TimelineDay[] | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  /** 正在编辑哪一天（添加行程抽屉） */
  const [editingDay, setEditingDay] = useState<{ id: number; label: string } | null>(null)
  /** 正在哪一天写回忆（记一笔抽屉）；id=null 表示这一天还不存在，由服务端补出第一天 */
  const [composingDay, setComposingDay] = useState<{ id: number | null; label: string; date: string | null } | null>(null)
  /** 是否正在「添加一天」 */
  const [addingDay, setAddingDay] = useState(false)

  const load = useCallback(() => {
    let alive = true
    fetch(apiUrl(`/api/travels/${travelId}/timeline`), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (j?.timeline?.days) setDays(j.timeline.days)
        else setError(j?.error || '时间线加载失败')
      })
      .catch(() => { if (alive) setError('网络错误') })
    return () => { alive = false }
  }, [travelId])

  useEffect(() => {
    const cleanup = load()
    return cleanup
  }, [load, reloadKey])

  if (error) return null // 静默降级：时间线失败不阻塞详情页
  if (days === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-travel-ink/40">
        <Icon icon={Loader2} size="sm" className="animate-spin" />
        <span className="text-sm">时间线加载中...</span>
      </div>
    )
  }

  /**
   * 0 天时的兜底（真机反馈："建完的旅行没法进一步设置"）。
   *
   * 旧行为是 `return null` —— 整块时间线直接消失，用户既看不到分天结构，
   * 也点不到「记一笔 / 添加行程」，页面下方空空的以为功能没做。
   * 服务端已会按区间惰性补「天」，但存量的、没填日期的旅行仍可能是 0 天，
   * 所以这里必须给出可下手的入口，而不是静默消失。
   */
  if (days.length === 0) {
    return (
      <section className="mt-14" aria-label="按天回顾">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-travel-line/70 py-10 text-center">
          <p className="text-sm text-travel-ink/55">还没有分天记录</p>
          <p className="max-w-xs text-xs text-travel-ink/40">
            直接记一笔就会自动开第一天；左上角「编辑信息」里的日期区间能决定一共几天。
          </p>
          <button
            type="button"
            onClick={() => setComposingDay({ id: null, label: '第一天', date: null })}
            className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-travel-accent px-5 text-sm font-semibold text-white active:scale-95"
          >
            <Icon icon={Sparkles} size="sm" />
            记一笔
          </button>
          <button
            type="button"
            onClick={() => setAddingDay(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-dashed border-travel-dim/80 px-5 text-sm font-medium text-travel-ink/70 active:scale-95"
          >
            <Icon icon={Plus} size="sm" />
            添加一天
          </button>
        </div>

        {composingDay && (
          <MemoryComposer
            travelId={travelId}
            // dayId=null：这一天还不存在，由服务端补出第一天并把回忆挂上去
            dayId={null}
            dayLabel={composingDay.label}
            dayDate={composingDay.date}
            onClose={() => setComposingDay(null)}
            onDone={() => setReloadKey((k) => k + 1)}
          />
        )}
        {addingDay && (
          <AddDaySheet travelId={travelId} onClose={() => setAddingDay(false)} onDone={() => setReloadKey((k) => k + 1)} />
        )}
      </section>
    )
  }

  return (
    <section className="mt-14">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-bold text-travel-ink flex items-center gap-2">
          <Icon icon={CalendarDays} size="md" className="text-travel-bloom" />
          按天回顾
        </h2>
        <span className="text-xs text-travel-ink/50">{days.length} 天</span>
        <button
          type="button"
          onClick={() => setAddingDay(true)}
          className="ml-auto inline-flex min-h-[36px] items-center gap-1 rounded-full border border-dashed border-travel-dim/80 px-3 text-xs font-medium text-travel-ink/70 transition-colors hover:border-travel-bloom hover:bg-travel-sakura/40 active:scale-95"
        >
          <Icon icon={Plus} size="sm" />
          加一天
        </button>
      </div>

      <div className="relative">
        {/* 时间线竖线 */}
        <span className="absolute left-[9px] top-2 bottom-2 w-px bg-gradient-to-b from-travel-bloom/60 via-travel-mist/50 to-transparent" aria-hidden="true" />

        <div className="space-y-8">
          {days.map((day, idx) => (
            <div key={day.id} className="relative pl-8">
              {/* 节点 */}
              <span className="absolute left-0 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-travel-bloom/50 bg-travel-cream">
                <span className="h-2 w-2 rounded-full bg-travel-bloom" />
              </span>

              <div className="rounded-2xl border border-travel-dim/60 bg-white/60 p-5 shadow-sm">
                {/* 章节头 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-travel-ink">DAY {String(idx + 1).padStart(2, '0')}</span>
                  {day.date && <span className="text-xs text-travel-ink/50">{formatDay(day.date)}</span>}
                  {day.title && <span className="text-sm font-medium text-travel-ink/80">· {day.title}</span>}
                </div>
                {day.summary && <p className="mt-1.5 text-sm text-travel-ink/70 leading-relaxed">{day.summary}</p>}

                {/* 行程项：按 type 显示对应图标（景点/餐厅/住宿/交通/活动/其他）
                    此前对全部类型硬编码同一个 MapPin，type 字段完全没用上 */}
                {day.itinerary.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {day.itinerary.map((it) => (
                      <ItineraryChip key={it.id} type={it.type} locationName={it.locationName}>
                        {it.title}
                      </ItineraryChip>
                    ))}
                  </div>
                )}

                {/* 这一天能做什么：记一笔（可传照片） / 添加行程（景点等）
                    此前两个入口都不存在 —— 用户只能"看"，不能"记"。 */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setComposingDay({ id: day.id, label: `DAY ${String(idx + 1).padStart(2, '0')}${day.date ? ` · ${formatDay(day.date)}` : ''}`, date: day.date })}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[var(--m-accent-soft)] px-3.5 text-xs font-medium text-[var(--m-accent-strong)] active:scale-95"
                  >
                    <Icon icon={Sparkles} size="sm" />
                    记一笔
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingDay({ id: day.id, label: `DAY ${String(idx + 1).padStart(2, '0')}${day.date ? ` · ${formatDay(day.date)}` : ''}` })}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-dashed border-travel-dim/80 px-3.5 text-xs font-medium text-travel-ink/70 transition-colors hover:border-travel-bloom hover:bg-travel-sakura/40 hover:text-travel-ink"
                  >
                    <Icon icon={Plus} size="sm" />
                    添加行程
                  </button>
                </div>

                {/* 照片墙 */}
                {day.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {day.photos.slice(0, 8).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                    ))}
                    {day.photos.length > 8 && (
                      <div className="flex aspect-square items-center justify-center rounded-lg bg-travel-sakura/50 text-xs text-travel-ink/70">
                        +{day.photos.length - 8}
                      </div>
                    )}
                  </div>
                )}

                {/* 回忆 */}
                {day.memories.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {day.memories.map((mem) => (
                      <div key={mem.id} className="flex items-start gap-2 rounded-xl bg-travel-sakura/30 px-3 py-2.5">
                        <Icon icon={Sparkles} size="sm" className="mt-0.5 shrink-0 text-travel-bloom" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-travel-ink">
                            {mem.title}
                            {mem.mood && <span className="ml-1.5 text-xs font-normal text-travel-ink/50">· {MOOD_LABEL[mem.mood] || mem.mood}</span>}
                          </p>
                          {mem.content && <p className="mt-0.5 text-sm text-travel-ink/70 leading-relaxed line-clamp-3 whitespace-pre-wrap">{mem.content}</p>}
                          {mem.photos.length > 0 && (
                            <div className="mt-1.5 flex gap-1">
                              {mem.photos.slice(0, 3).map((p) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={p.id} src={p.url} alt="" className="h-12 w-12 rounded-md object-cover" loading="lazy" />
                              ))}
                            </div>
                          )}
                          <MemoryPhotoPicker memoryId={mem.id} onDone={() => setReloadKey((k) => k + 1)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {day.itinerary.length === 0 && day.photos.length === 0 && day.memories.length === 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-travel-ink/40">
                    <Icon icon={Camera} size="sm" /> 这一天还没有记录
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingDay && (
        <ItineraryEditor
          travelId={travelId}
          dayId={editingDay.id}
          dayLabel={editingDay.label}
          onClose={() => setEditingDay(null)}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}

      {composingDay && (
        <MemoryComposer
          travelId={travelId}
          dayId={composingDay.id}
          dayLabel={composingDay.label}
          dayDate={composingDay.date}
          onClose={() => setComposingDay(null)}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}

      {addingDay && (
        <AddDaySheet travelId={travelId} onClose={() => setAddingDay(false)} onDone={() => setReloadKey((k) => k + 1)} />
      )}
    </section>
  )
}
