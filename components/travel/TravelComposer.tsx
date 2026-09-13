'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Sparkles, X, ArrowLeft } from 'lucide-react'
import { createTravel } from '@/lib/modules/offline/travel-write'
import { apiUrl } from '@/lib/api-base'

const TRAVEL_TYPES: { value: string; label: string }[] = [
  { value: 'ALONE', label: '独旅' },
  { value: 'COUPLE', label: '情侣' },
  { value: 'FAMILY', label: '家庭' },
  { value: 'FRIENDS', label: '朋友' },
  { value: 'BFF', label: '闺蜜/兄弟' },
  { value: 'GROUP', label: '结伴' },
  { value: 'OTHER', label: '其他' },
]

interface Companion {
  name: string
  relation: string
}

const MAX_COMPANIONS = 10

/**
 * 新建旅行：离线时本地乐观写 + 入同步队列（联网自动上传云端），在线直接创建。
 * 移动端不设 /admin，此即 /travel 模块内的新建入口。
 */
export default function TravelComposer({
  onCreated,
  autoOpen = false,
  hideTrigger = false,
  standalone = false,
  onClose,
}: {
  onCreated?: () => void
  autoOpen?: boolean
  hideTrigger?: boolean
  /** 全屏页面模式：不渲染弹窗，直接以整页表单展示（移动端新建旅行专用） */
  standalone?: boolean
  onClose?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(standalone || autoOpen)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [travelType, setTravelType] = useState('ALONE')
  const [companions, setCompanions] = useState<Companion[]>([])
  const [companionName, setCompanionName] = useState('')
  const [companionRelation, setCompanionRelation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 父级稍后通过 compose=1 将 autoOpen 置为 true 时，需要同步展开表单
  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  const addCompanion = () => {
    const name = companionName.trim()
    if (!name || companions.length >= MAX_COMPANIONS) return
    setCompanions([...companions, { name, relation: companionRelation.trim() }])
    setCompanionName('')
    setCompanionRelation('')
  }

  const removeCompanion = (index: number) => {
    setCompanions(companions.filter((_, i) => i !== index))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setMessage(null)
    const r = await createTravel({
      title: title.trim(),
      description: description.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      travelType: travelType as never,
      companions: companions.length > 0 ? companions : undefined,
    })
    if (r.ok) {
      setTitle('')
      setDescription('')
      setStartDate('')
      setEndDate('')
      setTravelType('ALONE')
      setCompanions([])
      setMessage({ type: 'ok', text: r.local ? '已保存到本地，联网后自动上传' : '创建成功' })
      onCreated?.()
      setTimeout(() => {
        setOpen(false)
        setMessage(null)
        onClose?.()
      }, 1200)
    } else {
      setMessage({ type: 'err', text: r.error || '创建失败' })
    }
    setSubmitting(false)
  }

  // 游客可浏览公开内容，但记录自己的旅行需登录/注册（M0 · 产品规则）
  const tryOpen = async () => {
    try {
      const res = await fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (data && data.authenticated) {
        setOpen(true)
      } else {
        router.push('/login?redirect=/travel')
      }
    } catch {
      router.push('/login?redirect=/travel')
    }
  }

  // 全屏页面模式：始终展开，不渲染触发按钮
  if (standalone) {
    return (
      <FullPageComposer
        title={title}
        setTitle={setTitle}
        description={description}
        setDescription={setDescription}
        travelType={travelType}
        setTravelType={setTravelType}
        companionName={companionName}
        setCompanionName={setCompanionName}
        companionRelation={companionRelation}
        setCompanionRelation={setCompanionRelation}
        companions={companions}
        addCompanion={addCompanion}
        removeCompanion={removeCompanion}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        submitting={submitting}
        message={message}
        onSubmit={submit}
        onBack={() => {
          setOpen(false)
          onClose?.()
        }}
      />
    )
  }

  if (!open) {
    if (hideTrigger) {
      return null
    }
    return (
      <button
        type="button"
        onClick={tryOpen}
        className="inline-flex items-center gap-1.5 rounded-full bg-travel-bloom px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-[#DDA5B2]"
      >
        <Plus className="h-4 w-4" />
        新建旅行
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="relative w-full max-w-md rounded-2xl border border-travel-dim bg-travel-cream p-4 shadow-lg"
    >
      <button
        type="button"
        onClick={() => {
          setOpen(false)
          onClose?.()
        }}
        className="absolute right-2 top-2 rounded-full p-1 text-travel-ink/50 hover:bg-travel-dim/50"
        aria-label="关闭"
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="mb-3 font-semibold text-travel-ink">新建旅行</h3>
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="旅行名称（必填）"
          className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-bloom"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="描述（可选）"
          className="w-full resize-none rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-bloom"
        />
        <div>
          <span className="mb-1.5 block text-xs text-travel-ink/60">这次旅行是？</span>
          <div className="flex flex-wrap gap-1.5">
            {TRAVEL_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTravelType(t.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  travelType === t.value
                    ? 'bg-travel-bloom text-white'
                    : 'bg-travel-dim/40 text-travel-ink/70 hover:bg-travel-dim/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs text-travel-ink/60">
            和谁一起去的？<span className="text-travel-ink/40">（可选，最多 {MAX_COMPANIONS} 人）</span>
          </span>
          <div className="flex gap-2">
            <input
              value={companionName}
              onChange={(e) => setCompanionName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCompanion() } }}
              placeholder="姓名"
              maxLength={40}
              className="w-28 rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-bloom"
            />
            <input
              value={companionRelation}
              onChange={(e) => setCompanionRelation(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCompanion() } }}
              placeholder="关系（可选）"
              maxLength={20}
              className="flex-1 rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-bloom"
            />
            <button
              type="button"
              onClick={addCompanion}
              disabled={!companionName.trim() || companions.length >= MAX_COMPANIONS}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-travel-dim/40 px-3 py-2 text-xs font-medium text-travel-ink/70 transition hover:bg-travel-dim/70 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />添加
            </button>
          </div>
          {companions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {companions.map((c, i) => (
                <span
                  key={`${c.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-travel-sakura/50 px-2.5 py-1 text-xs text-travel-ink"
                >
                  {c.name}
                  {c.relation ? <span className="text-travel-ink/50">· {c.relation}</span> : null}
                  <button
                    type="button"
                    onClick={() => removeCompanion(i)}
                    aria-label={`移除 ${c.name}`}
                    className="ml-0.5 rounded-full p-0.5 text-travel-ink/50 transition hover:bg-travel-bloom/20 hover:text-travel-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-travel-ink/60">开始日期</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none focus:border-travel-bloom"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-travel-ink/60">结束日期</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none focus:border-travel-bloom"
            />
          </label>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        {message && (
          <p className={`flex items-center gap-1.5 text-xs ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
            <Sparkles className="h-3 w-3" />
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-travel-bloom px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#DDA5B2] disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          保存
        </button>
      </div>
    </form>
  )
}

/** 全屏新建旅行页（移动端）：避免弹窗溢出，作为独立页面整屏展示。 */
function FullPageComposer({
  title, setTitle, description, setDescription,
  travelType, setTravelType,
  companionName, setCompanionName, companionRelation, setCompanionRelation,
  companions, addCompanion, removeCompanion,
  startDate, setStartDate, endDate, setEndDate,
  submitting, message, onSubmit, onBack,
}: {
  title: string; setTitle: (v: string) => void
  description: string; setDescription: (v: string) => void
  travelType: string; setTravelType: (v: string) => void
  companionName: string; setCompanionName: (v: string) => void
  companionRelation: string; setCompanionRelation: (v: string) => void
  companions: Companion[]; addCompanion: () => void; removeCompanion: (i: number) => void
  startDate: string; setStartDate: (v: string) => void
  endDate: string; setEndDate: (v: string) => void
  submitting: boolean
  message: { type: 'ok' | 'err'; text: string } | null
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--m-bg)] text-[var(--m-text)]">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--m-bg) 82%, transparent)' }}>
        <button type="button" onClick={onBack} aria-label="返回"
          className="-ml-1 flex h-11 w-11 items-center justify-center rounded-full text-[var(--m-text)] active:scale-95 transition">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-[26px] font-bold leading-none tracking-[-0.02em]">新建旅行</h1>
          <p className="mt-1 text-xs text-[var(--m-muted)]">记录一段新的旅程</p>
        </div>
      </header>

      {/* 表单主体：整屏可滚动，不吃进弹窗 */}
      <main className="px-4 pb-[calc(110px+env(safe-area-inset-bottom))]">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="m-card p-4">
            <label className="mb-1.5 block text-xs font-medium text-[var(--m-muted)]">旅行名称</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="旅行名称（必填）" maxLength={60}
              className="w-full rounded-xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]" />
            <label className="mb-1.5 mt-4 block text-xs font-medium text-[var(--m-muted)]">描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="描述（可选）"
              className="w-full resize-none rounded-xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]" />
          </div>

          <div className="m-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">这次旅行是？</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {TRAVEL_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setTravelType(t.value)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${travelType === t.value ?
                    'bg-[var(--m-accent)] text-white shadow-[var(--m-shadow-sm)]' :
                    'border border-[var(--m-line)] text-[var(--m-muted)] active:scale-95'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="m-card p-4">
            <span className="text-sm font-semibold">和谁一起去的？</span>
            <span className="ml-1 text-xs text-[var(--m-faint)]">（可选，最多 {MAX_COMPANIONS} 人）</span>
            <div className="mt-3 flex gap-2">
              <input value={companionName} onChange={(e) => setCompanionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCompanion() } }}
                placeholder="姓名" maxLength={40}
                className="flex-1 rounded-xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]" />
              <input value={companionRelation} onChange={(e) => setCompanionRelation(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCompanion() } }}
                placeholder="关系（可选）" maxLength={20}
                className="w-28 rounded-xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]" />
              <button type="button" onClick={addCompanion} disabled={!companionName.trim() || companions.length >= MAX_COMPANIONS}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[var(--m-accent-soft)] px-3.5 text-[13px] font-medium text-[var(--m-accent-strong)] disabled:opacity-40">
                <Plus className="h-4 w-4" />添加
              </button>
            </div>
            {companions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {companions.map((c, i) => (
                  <span key={`${c.name}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--m-line)] px-3 py-1.5 text-[13px] text-[var(--m-text)]">
                    {c.name}{c.relation ? <span className="text-[var(--m-faint)]">· {c.relation}</span> : null}
                    <button type="button" onClick={() => removeCompanion(i)} aria-label={`移除 ${c.name}`}
                      className="ml-0.5 rounded-full p-0.5 text-[var(--m-faint)] hover:text-[var(--m-text)]"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="m-card p-4">
            <div className="flex gap-3">
              <label className="flex-1">
                <span className="mb-1.5 block text-xs font-medium text-[var(--m-muted)]">开始日期</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none focus:border-[var(--m-accent)]" />
              </label>
              <label className="flex-1">
                <span className="mb-1.5 block text-xs font-medium text-[var(--m-muted)]">结束日期</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none focus:border-[var(--m-accent)]" />
              </label>
            </div>
          </div>

          {message && (
            <p className={`flex items-center gap-1.5 text-[13px] ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
              <Sparkles className="h-3.5 w-3.5" />{message.text}
            </p>
          )}

          {/* 底部提交条 */}
          <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 -mx-4 px-4 pt-2"
            style={{ background: 'linear-gradient(to top, var(--m-bg) 75%, transparent)' }}>
            <button type="submit" disabled={submitting || !title.trim()}
              className="h-13 min-h-[52px] w-full rounded-2xl bg-[var(--m-accent)] text-[16px] font-semibold text-white shadow-[var(--m-shadow-lg)] transition active:scale-[0.98] disabled:opacity-50">
              {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : '保存旅行'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

