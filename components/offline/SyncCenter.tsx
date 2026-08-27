'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Loader2, CheckCheck, ShieldCheck } from 'lucide-react'
import { SyncQueue } from '@/lib/modules/offline/sync-queue'
import { getSyncQueueStorage } from '@/lib/modules/offline/storage'
import type { SyncQueueItem } from '@/lib/modules/offline/types'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import { getPrivacyLockEnabled, setPrivacyLockEnabled } from '@/lib/modules/offline/privacy-lock'
import { getSyncEngine } from '@/lib/modules/offline/bootstrap'

type StatCounts = { PENDING: number; SYNCING: number; FAILED: number }

export default function SyncCenter() {
  const [stats, setStats] = useState<StatCounts>({ PENDING: 0, SYNCING: 0, FAILED: 0 })
  const [failed, setFailed] = useState<SyncQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // v3.1 M4-C1：本地隐私锁
  const [lockEnabled, setLockEnabled] = useState(false)
  // v3.1 M4-C1：最近同步统计（冲突保护/写入量）
  const [lastSync, setLastSync] = useState<{ at: number; written: number } | null>(null)

  useEffect(() => {
    setLockEnabled(getPrivacyLockEnabled())
    const engine = getSyncEngine()
    if (engine?.lastSyncStats) setLastSync(engine.lastSyncStats)
  }, [])

  const load = useCallback(async () => {
    try {
      const queue = new SyncQueue(getSyncQueueStorage())
      const [s, all] = await Promise.all([queue.stats(), queue.all()])
      setStats(s)
      setFailed(all.filter((i) => i.status === 'FAILED'))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取同步状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const retryAll = async () => {
    setBusy(true)
    try {
      const queue = new SyncQueue(getSyncQueueStorage())
      for (const f of failed) await queue.retry(f.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '重试失败')
    } finally {
      setBusy(false)
    }
  }

  const retryOne = async (id: number) => {
    setBusy(true)
    try {
      const queue = new SyncQueue(getSyncQueueStorage())
      await queue.retry(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '重试失败')
    } finally {
      setBusy(false)
    }
  }

  const total = stats.PENDING + stats.SYNCING + stats.FAILED

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-28 text-[var(--social-text)]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      <div className="relative mx-auto max-w-2xl px-4 py-6">
        <header className="mb-8 flex items-center gap-3">
          <div className="ml-auto"><SocialThemeToggle /></div>
          <Link href="/me" className="rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--social-accent)]">Sync</p>
            <h1 className="text-xl font-semibold">数据与同步</h1>
          </div>
        </header>

        {loading ? (
          <div className="py-20 text-center text-[var(--social-faint)]"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['待上传', stats.PENDING],
                ['上传中', stats.SYNCING],
                ['失败', stats.FAILED],
              ] as Array<[string, number]>).map(([label, value]) => (
                <div key={label} className="rounded-[1.4rem] bg-[var(--social-surface-80)] p-5 text-center ring-1 ring-[var(--social-line)]">
                  <div className="text-2xl font-semibold tabular-nums">{value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--social-accent)]">{label}</div>
                </div>
              ))}
            </div>

            {total === 0 && (
              <div className="mt-6 rounded-[2rem] bg-[var(--social-surface-50)] px-6 py-14 text-center ring-1 ring-[var(--social-line)]">
                <CheckCheck className="mx-auto h-8 w-8 text-[var(--social-accent)]" />
                <p className="mt-4 text-sm text-[var(--social-muted)]">所有改动都已同步。</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--social-faint)]">离线写的照片、留言、碎碎念会进入队列，联网后自动上传。</p>
                {lastSync && (
                  <p className="mt-3 text-xs text-[var(--social-faint)]">
                    最近同步：{new Date(lastSync.at).toLocaleTimeString('zh-CN')} · 更新 {lastSync.written} 条本地缓存
                  </p>
                )}
              </div>
            )}

            {failed.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--social-accent)]">失败项</h2>
                  <div className="h-px flex-1 bg-[var(--social-line)]" />
                  <button type="button" onClick={retryAll} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface)] px-4 py-1.5 text-xs text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)] disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5" />全部重试
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {failed.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 rounded-[1.2rem] bg-[var(--social-surface-80)] px-4 py-3 ring-1 ring-[var(--social-line)]">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{f.entityType} · {f.operation}</div>
                        <div className="mt-0.5 truncate text-xs text-[var(--social-faint)]">{f.lastError || '同步失败'}</div>
                      </div>
                      <button type="button" onClick={() => retryOne(f.id)} disabled={busy} className="rounded-full bg-[var(--social-accent-soft)] px-3 py-1.5 text-xs text-[var(--social-accent)] transition hover:bg-[var(--social-accent)] hover:text-[var(--social-on-accent)] disabled:opacity-50">重试</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {error && <p className="mt-6 text-sm text-[#E06C6C]">{error}</p>}

            {/* v3.1 M4-C3：本地隐私锁 */}
            <section className="mt-10 rounded-[1.6rem] bg-[var(--social-surface-60)] p-5 ring-1 ring-[var(--social-line)]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--social-accent)]" />
                  <div>
                    <h2 className="text-sm font-medium">本地隐私锁</h2>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--social-faint)]">
                      开启后，打开相册、回忆等私密模块前需验证 PIN / 生物识别；本地数据库可启用加密（真机生效）。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={lockEnabled}
                  onClick={() => { const next = !lockEnabled; setLockEnabled(next); setPrivacyLockEnabled(next) }}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${lockEnabled ? 'bg-[var(--social-accent)]' : 'bg-[var(--social-line-strong)]'}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${lockEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
