'use client'

import Link from 'next/link'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Loader2, MapPin, Wallet, CalendarDays, X } from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'
import { AdminInput, AdminButton, AdminCard } from '@/components/admin/ui'

interface TravelSummary {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  dayCount: number
  expenseTotal: number
}

interface ItineraryItem {
  id: number
  title: string
  startTime: string | null
  endTime: string | null
  type: string
  notes: string | null
  locationName: string | null
}

interface TravelDay {
  id: number
  date: string | null
  title: string | null
  summary: string | null
  sortOrder: number
  itinerary: ItineraryItem[]
}

interface Expense {
  id: number
  amount: number
  currency: string
  category: string
  payer: string | null
  note: string | null
  happenedAt: string | null
}

interface TravelDetail {
  id: number
  title: string
  slug: string
  description: string | null
  startDate: string | null
  endDate: string | null
  status: string
  days: TravelDay[]
  expenses: Expense[]
}

const ITINERARY_TYPES = ['SPOT', 'RESTAURANT', 'HOTEL', 'TRANSPORT', 'ACTIVITY', 'OTHER']
const ITINERARY_LABELS: Record<string, string> = {
  SPOT: '景点', RESTAURANT: '餐厅', HOTEL: '住宿', TRANSPORT: '交通', ACTIVITY: '活动', OTHER: '其他',
}
const EXPENSE_CATEGORIES = ['TRANSPORT', 'HOTEL', 'FOOD', 'TICKET', 'SHOPPING', 'OTHER']
const EXPENSE_LABELS: Record<string, string> = {
  TRANSPORT: '交通', HOTEL: '住宿', FOOD: '餐饮', TICKET: '门票', SHOPPING: '购物', OTHER: '其他',
}

export default function AdminTravelsPage() {
  const [travels, setTravels] = useState<TravelSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<TravelDetail | null>(null)

  // create
  const [createTitle, setCreateTitle] = useState('')
  const [createStart, setCreateStart] = useState('')
  const [createEnd, setCreateEnd] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // day form
  const [dayDate, setDayDate] = useState('')
  const [dayTitle, setDayTitle] = useState('')

  // itinerary form
  const [itineraryDay, setItineraryDay] = useState<number | null>(null)
  const [itineraryTitle, setItineraryTitle] = useState('')
  const [itineraryType, setItineraryType] = useState('SPOT')
  const [itineraryTime, setItineraryTime] = useState('')

  // expense form
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('TRANSPORT')
  const [expensePayer, setExpensePayer] = useState('')

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/travels')
      if (res.ok) {
        const data = await res.json()
        setTravels(data.travels || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  const fetchDetail = useCallback(async (id: number) => {
    const res = await fetch(`/api/admin/travels/${id}`)
    if (res.ok) {
      const data = await res.json()
      setDetail(data.travel || null)
    }
  }, [])

  useEffect(() => {
    if (selected !== null) fetchDetail(selected)
  }, [selected, fetchDetail])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!createTitle.trim()) { setError('请输入旅行名称'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/travels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: createTitle.trim(), startDate: createStart || undefined, endDate: createEnd || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || '创建失败'); return }
      setCreateTitle(''); setCreateStart(''); setCreateEnd('')
      await fetchList()
      setSelected(data.id)
    } catch { setError('网络错误') } finally { setCreating(false) }
  }

  const handleDeleteTravel = async () => {
    if (!selected || !confirm('确定删除该旅行规划（含天数/行程/花费）？')) return
    const res = await fetch(`/api/admin/travels/${selected}`, { method: 'DELETE' })
    if (res.ok) { setSelected(null); setDetail(null); await fetchList() }
  }

  const handleAddDay = async () => {
    if (!selected) return
    const res = await fetch(`/api/admin/travels/${selected}/days`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dayDate || undefined, title: dayTitle || undefined }),
    })
    if (res.ok) { setDayDate(''); setDayTitle(''); await fetchDetail(selected) }
  }

  const handleDeleteDay = async (dayId: number) => {
    if (!selected) return
    const res = await fetch(`/api/admin/travels/${selected}/days/${dayId}`, { method: 'DELETE' })
    if (res.ok) await fetchDetail(selected)
  }

  const handleAddItinerary = async () => {
    if (!selected || itineraryDay === null || !itineraryTitle.trim()) return
    const res = await fetch(`/api/admin/travels/${selected}/itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dayId: itineraryDay,
        title: itineraryTitle.trim(),
        type: itineraryType,
        startTime: itineraryTime ? `${itineraryTime}:00` : undefined,
      }),
    })
    if (res.ok) { setItineraryTitle(''); setItineraryTime(''); await fetchDetail(selected) }
  }

  const handleDeleteItinerary = async (itemId: number) => {
    if (!selected) return
    const res = await fetch(`/api/admin/travels/${selected}/itinerary/${itemId}`, { method: 'DELETE' })
    if (res.ok) await fetchDetail(selected)
  }

  const handleAddExpense = async () => {
    if (!selected) return
    const res = await fetch(`/api/admin/travels/${selected}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat(expenseAmount),
        category: expenseCategory,
        payer: expensePayer || undefined,
      }),
    })
    if (res.ok) { setExpenseAmount(''); setExpensePayer(''); await fetchDetail(selected) }
  }

  const handleDeleteExpense = async (expenseId: number) => {
    if (!selected) return
    const res = await fetch(`/api/admin/travels/${selected}/expenses/${expenseId}`, { method: 'DELETE' })
    if (res.ok) await fetchDetail(selected)
  }

  const totalExpense = detail?.expenses.reduce((s, e) => s + e.amount, 0) || 0

  return (
    <AdminShell title="旅行规划">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-travel-accent dark:hover:text-travel-accentSoft transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回后台
        </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">旅行规划</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          管理旅行、每天行程与花费（数据模型：Travel / TravelDay / ItineraryItem / Expense）
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* 左列：旅行列表 */}
        <div>
          <form onSubmit={handleCreate} className="card p-5 mb-4">
            <h2 className="text-base font-semibold text-travel-ink dark:text-gray-100 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-travel-accentSoft" />
              新建旅行
            </h2>
            <AdminInput
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="旅行名称，如：东京 · 2026"
              className="mb-2"
            />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <AdminInput type="date" value={createStart} onChange={(e) => setCreateStart(e.target.value)} />
              <AdminInput type="date" value={createEnd} onChange={(e) => setCreateEnd(e.target.value)} />
            </div>
            {error && <p className="text-xs text-travel-danger mb-2">{error}</p>}
            <AdminButton type="submit" disabled={creating} className="w-full">
              {creating ? '创建中...' : '创建旅行'}
            </AdminButton>
          </form>

          {loading ? (
            <div className="py-10 text-center text-travel-ink/50 dark:text-gray-500">加载中...</div>
          ) : travels.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-travel-bloom/50 bg-white/50 p-6 text-center text-travel-ink/60 dark:border-[#32261D] dark:bg-white/5">还没有旅行规划</div>
          ) : (
            <div className="space-y-2">
              {travels.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                    selected === t.id
                      ? 'bg-travel-sakura/50 dark:bg-travel-accent/20 border border-travel-sakura dark:border-travel-accent/40'
                      : 'bg-white/80 dark:bg-white/5 border border-travel-line/50 dark:border-[#2C343E] hover:border-travel-sakura'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-travel-ink dark:text-gray-100 truncate">{t.title}</p>
                    <p className="text-xs text-travel-ink/60">
                      {t.dayCount} 天 · 花费 ¥{t.expenseTotal.toFixed(0)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右列：详情 */}
        <div className="lg:col-span-2 space-y-4">
          {!selected || !detail ? (
            <div className="rounded-2xl border-2 border-dashed border-travel-bloom/50 bg-white/50 p-12 text-center text-travel-ink/60 dark:border-[#32261D] dark:bg-white/5">选择或创建一个旅行开始规划</div>
          ) : (
            <>
              {/* 基本信息 */}
              <AdminCard className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-travel-ink dark:text-gray-100 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-travel-accentSoft" />
                      {detail.title}
                    </h2>
                    <p className="text-sm text-travel-ink/60 mt-1">
                      {detail.startDate ? detail.startDate.slice(0, 10) : '—'} ~ {detail.endDate ? detail.endDate.slice(0, 10) : '—'} · {detail.status}
                    </p>
                  </div>
                  <AdminButton variant="danger" type="button" onClick={handleDeleteTravel}>
                    <Trash2 className="w-4 h-4" /> 删除
                  </AdminButton>
                </div>
              </AdminCard>

              {/* 天数 + 行程 */}
              <AdminCard className="p-5">
                <h3 className="font-semibold text-travel-ink dark:text-gray-100 mb-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-travel-accentSoft" />
                  行程安排
                </h3>
                <div className="flex gap-2 mb-4">
                  <AdminInput type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className="!w-auto" />
                  <AdminInput type="text" value={dayTitle} onChange={(e) => setDayTitle(e.target.value)} placeholder="Day 标题（可选）" className="flex-1" />
                  <AdminButton type="button" onClick={handleAddDay}>+ 添加天数</AdminButton>
                </div>

                {detail.days.length === 0 ? (
                  <p className="text-sm text-travel-ink/50 text-center py-6">还没有天数，先添加 Day 1</p>
                ) : (
                  <div className="space-y-4">
                    {detail.days.map((day) => (
                      <div key={day.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-travel-accent">
                              Day {day.sortOrder + 1}
                            </span>
                            {day.date && <span className="text-xs text-gray-500">{day.date.slice(0, 10)}</span>}
                            {day.title && <span className="text-sm text-gray-700 dark:text-gray-200">{day.title}</span>}
                          </div>
                          <button type="button" onClick={() => handleDeleteDay(day.id)} className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {day.itinerary.length > 0 && (
                          <ul className="space-y-1.5 mb-3">
                            {day.itinerary.map((item) => (
                              <li key={item.id} className="flex items-center gap-2 text-sm">
                                <span className="inline-block w-16 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-center">
                                  {ITINERARY_LABELS[item.type] || item.type}
                                </span>
                                <span className="text-gray-700 dark:text-gray-200">{item.title}</span>
                                {item.startTime && (
                                  <span className="text-xs text-gray-400">{item.startTime.slice(11, 16)}</span>
                                )}
                                <button type="button" onClick={() => handleDeleteItinerary(item.id)} className="ml-auto p-0.5 text-red-400 hover:text-red-500">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={itineraryDay === day.id ? itineraryTitle : ''}
                            onChange={(e) => { setItineraryTitle(e.target.value); setItineraryDay(day.id) }}
                            placeholder="添加行程，如：浅草寺"
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <select
                            value={itineraryDay === day.id ? itineraryType : 'SPOT'}
                            onChange={(e) => { setItineraryType(e.target.value); setItineraryDay(day.id) }}
                            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          >
                            {ITINERARY_TYPES.map((tp) => (
                              <option key={tp} value={tp}>{ITINERARY_LABELS[tp]}</option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={itineraryDay === day.id ? itineraryTime : ''}
                            onChange={(e) => { setItineraryTime(e.target.value); setItineraryDay(day.id) }}
                            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <button type="button" onClick={handleAddItinerary} className="px-3 py-1.5 text-sm text-travel-accent hover:bg-travel-sakura/60 dark:hover:bg-travel-accentStrong/20 rounded-lg transition-colors">
                            添加
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AdminCard>

              {/* 花费 */}
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-500" />
                  旅行花费
                  <span className="ml-auto text-sm text-gray-500">合计 ¥{totalExpense.toFixed(2)}</span>
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  <input
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="金额"
                    className="w-24 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={expensePayer}
                    onChange={(e) => setExpensePayer(e.target.value)}
                    placeholder="付款人（可选）"
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <button type="button" onClick={handleAddExpense} className="px-3 py-1.5 text-sm bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors">
                    添加花费
                  </button>
                </div>
                {detail.expenses.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">还没有花费记录</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.expenses.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-sm">
                        <span className="inline-block w-14 text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 text-center">
                          {EXPENSE_LABELS[e.category] || e.category}
                        </span>
                        <span className="font-medium text-gray-800 dark:text-gray-100">¥{e.amount.toFixed(2)}</span>
                        {e.payer && <span className="text-xs text-gray-400">({e.payer})</span>}
                        <button type="button" onClick={() => handleDeleteExpense(e.id)} className="ml-auto p-0.5 text-red-400 hover:text-red-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </AdminShell>
  )
}


