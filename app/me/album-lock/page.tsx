'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarHeart, Lock, ShieldCheck } from 'lucide-react'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { Button } from '@/components/mobile/Button'
import { Field } from '@/components/mobile/Field'
import { Icon } from '@/components/mobile/Icon'
import { DateField } from '@/components/travel/DateRangePicker'
import { toast } from '@/lib/mobile/toast-store'
import { apiUrl } from '@/lib/api-base'

/**
 * 「纪念日与相册锁」（2026-11-16 新增）。
 *
 * 背景：纪念相册的口令 = **当前用户的纪念日日期**（见 /api/verify-album-password），
 * 但这个日期此前只能在桌面后台的「纪念日管理」里改，App 里**没有任何入口** ——
 * 真机反馈「相册上锁了，但不知道去哪里设置/修改纪念日」。
 *
 * 接口复用 `/api/admin/settings/anniversary`（GET/POST）。它作用于**当前登录用户**，
 * 不要求站点管理能力位，只要求二次输入当前密码 —— 与「改密码」同级的安全口径。
 */
export default function AlbumLockPage() {
  const [value, setValue] = useState('')
  const [original, setOriginal] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [effective, setEffective] = useState<{ date: string; source: 'settings' | 'record' } | null>(null)

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const res = await fetch(apiUrl('/api/admin/settings/anniversary'), { credentials: 'include' })
        if (!res.ok) throw new Error('读取失败')
        const json = (await res.json()) as { anniversaryStart?: string | null }
        const configured = typeof json?.anniversaryStart === 'string' ? json.anniversaryStart.slice(0, 10) : ''
        if (!alive) return
        setValue(configured)
        setOriginal(configured || null)

        if (configured) {
          setEffective({ date: configured, source: 'settings' })
        } else {
          /**
           * 「账号里没填」≠「相册不设锁」：服务端在 anniversaryStart 为空时会退回
           * 最早的纪念日记录当口令（见 /api/verify-album-password 的兜底查询）。
           * 不把这一层说清楚，用户会以为「没设置 = 没有锁」，其实进相册还要输日期。
           */
          const listRes = await fetch(apiUrl('/api/anniversaries'), { credentials: 'include' })
          const listJson = listRes.ok
            ? ((await listRes.json().catch(() => null)) as { anniversaries?: { date?: string }[] } | null)
            : null
          const dates = (Array.isArray(listJson?.anniversaries) ? listJson.anniversaries : [])
            .map((item) => (typeof item?.date === 'string' ? item.date.slice(0, 10) : ''))
            .filter(Boolean)
            .sort()
          if (!alive) return
          setEffective(dates.length > 0 ? { date: dates[0], source: 'record' } : null)
        }
      } catch {
        if (alive) setError('纪念日读取失败，请稍后重试')
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  const save = async () => {
    if (!value) {
      setError('请选择纪念日日期')
      return
    }
    if (!password) {
      setError('请输入当前登录密码（修改纪念日需要二次确认）')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/admin/settings/anniversary'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anniversaryStart: value, currentPassword: password }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '保存失败')
      setOriginal(value)
      setPassword('')
      toast.success('纪念日已更新，相册口令同步生效')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const changed = value !== (original ?? '')

  return (
    <div className="m-mobile-page m-safe-top m-bottom-nav-safe bg-[var(--m-bg)] text-[var(--m-text)]">
      <LargeTitle
        title="纪念日与相册锁"
        eyebrow="甜途 · 纪念日"
        subtitle="纪念相册的解锁口令就是这一天的日期"
        back="/me"
      />

      <div className="space-y-4 px-4 pb-10">
        {/* 说明卡：先讲清楚「口令是什么」，用户才知道要填什么 */}
        <section className="m-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
              <Icon icon={Lock} size="md" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">相册解锁口令</p>
              <p className="mt-1 text-[13px] leading-5 text-[var(--m-muted)]">
                纪念相册上锁后，输入下面这个日期的年 / 月 / 日就能打开。改完立即生效，
                下次进相册用新日期解锁。
              </p>
              {/* 作用范围（2026-11-21）：相册默认是「旅行画册」，不需要解锁；
                  纪念日只锁像素 / 银河两种纪念相册视图。不写清楚的话，用户改完
                  纪念日回到默认画册，会以为设置没生效。 */}
              <p className="mt-1.5 text-[13px] leading-5 text-[var(--m-muted)]">
                只作用于「像素 / 银河」两种纪念相册视图；默认的旅行画册不需要解锁。
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--m-surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--m-muted)]">
                <Icon icon={CalendarHeart} size="sm" />
                {effective
                  ? `当前口令：${effective.date}${effective.source === 'record' ? '（取自纪念日记录）' : ''}`
                  : '当前未设置纪念日（像素 / 银河相册不设锁）'}
              </p>
              {effective?.source === 'record' && (
                <p className="mt-1.5 text-[13px] leading-5 text-[var(--m-muted)]">
                  你还没在这里单独设置过纪念日，相册目前用的是纪念日记录里最早的一天。
                  在下面保存一个新日期后，就会以新日期为准。
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="m-card space-y-4 p-4">
          <DateField label="纪念日" value={value} onChange={setValue} />

          <Field
            label="当前登录密码"
            type="password"
            inputMode="text"
            autoComplete="current-password"
            placeholder="修改纪念日需要验证身份"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="仅用于本次校验，不会保存"
          />

          {error && (
            <p role="alert" className="text-[13px] text-[var(--m-danger)]">
              {error}
            </p>
          )}

          <Button block size="lg" loading={saving} disabled={loading || !changed} onClick={save}>
            {loading ? '读取中…' : changed ? '保存纪念日' : '纪念日未修改'}
          </Button>
        </section>

        <Link
          href="/album"
          className="m-pressable flex min-h-[56px] items-center gap-3 rounded-2xl bg-[var(--m-surface-solid)] px-4 ring-1 ring-[var(--m-line)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--m-tone-mint-bg)] text-[var(--m-tone-mint-fg)]">
            <Icon icon={ShieldCheck} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">去纪念相册验证</span>
            <span className="mt-0.5 block text-[13px] text-[var(--m-muted)]">
              在相册里切到「像素 / 银河」视图，用新口令试一次解锁
            </span>
          </span>
        </Link>
      </div>
    </div>
  )
}
