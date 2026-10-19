'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Loader2, CheckCheck, AlertCircle } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { SyncQueue } from '@/lib/modules/offline/sync-queue'
import { getSyncQueueStorage } from '@/lib/modules/offline/storage'
import type { SyncQueueItem } from '@/lib/modules/offline/types'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'
import {
  clearPin,
  getPrivacyLockEnabled,
  hasPin,
  isValidPin,
  markUnlocked,
  setPin,
  setPrivacyLockEnabled,
  verifyPin,
} from '@/lib/modules/offline/privacy-lock'
import { getSyncEngine } from '@/lib/modules/offline/bootstrap'
import { getOfflineEncryptionState, getOfflineInitError } from '@/lib/modules/offline/native/sqlite-db'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { Switch } from '@/components/mobile/Switch'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Field } from '@/components/mobile/Field'
import { Button } from '@/components/mobile/Button'
import { CountUp } from '@/components/mobile/CountUp'
import { Stagger } from '@/components/mobile/Stagger'
import { getMediaStorageStats } from '@/lib/media/local-files'

type StatCounts = { PENDING: number; SYNCING: number; FAILED: number; DEAD: number }

type MediaUsage = Awaited<ReturnType<typeof getMediaStorageStats>>

/** 字节 → MB（保留 1 位；用于「本地媒体占用」一行说明） */
function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export default function SyncCenter() {
  const [stats, setStats] = useState<StatCounts>({ PENDING: 0, SYNCING: 0, FAILED: 0, DEAD: 0 })
  // B5：本地媒体配额占用（启动维护与上传收尾后会变化，进入页面时读一次）
  const [mediaUsage, setMediaUsage] = useState<MediaUsage | null>(null)
  const [failed, setFailed] = useState<SyncQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // C1：本地隐私锁（真实 PIN。开关只是"意图"，必须 setPin 成功才算开启）
  const [lockEnabled, setLockEnabled] = useState(false)
  /** PIN 面板：'set'=首次设置/重设；'verify'=关闭前验证；null=不显示 */
  const [pinSheet, setPinSheet] = useState<'set' | 'verify' | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  /** 本地库加密状态（C1：让用户知道"这台设备上的离线数据是否加密"） */
  const [encryption, setEncryption] = useState<{ encrypted: boolean; notice: string | null }>({
    encrypted: false,
    notice: null,
  })
  // v3.1 M4-C1：最近同步统计（冲突保护/写入量）
  const [lastSync, setLastSync] = useState<{ at: number; written: number } | null>(null)
  // 引擎内部被隔离的阶段错误（例如"本地队列读失败但上传照常"）：不阻断同步，但必须能看见
  const [engineError, setEngineError] = useState<string | null>(null)
  // 离线库初始化失败（连接/表结构/插件）：表现为"本地读全空、离线写失败"，必须能看见
  const [offlineInitError, setOfflineInitError] = useState<string | null>(null)

  useEffect(() => {
    void getMediaStorageStats()
      .then(setMediaUsage)
      .catch(() => setMediaUsage(null))
  }, [])

  useEffect(() => {
    /**
     * v3.1 的开关只写了一个 localStorage 标记、没有 PIN。升级到 C1 后
     * 这些设备的"开关=开"是假的（没有 PIN 就没有门禁），这里自动修复为关闭，
     * 避免界面显示"已开启"而实际不设防。
     */
    const enabled = getPrivacyLockEnabled()
    if (enabled && !hasPin()) {
      setPrivacyLockEnabled(false)
      setLockEnabled(false)
    } else {
      setLockEnabled(enabled)
    }
    setEncryption(getOfflineEncryptionState())
    const engine = getSyncEngine()
    if (engine?.lastSyncStats) setLastSync(engine.lastSyncStats)
    if (engine?.lastError) setEngineError(engine.lastError)
    setOfflineInitError(getOfflineInitError())
  }, [])

  const load = useCallback(async () => {
    try {
      const queue = new SyncQueue(getSyncQueueStorage())
      const [s, all] = await Promise.all([queue.stats(), queue.all()])
      setStats(s)
      /**
       * P1-23：DEAD（服务端明确拒绝/重试到顶）也要展示出来。
       * 只展示 FAILED 的话，永久失败的项会"从界面上消失"，用户不知道自己的内容没上去。
       */
      setFailed(all.filter((i) => i.status === 'FAILED' || i.status === 'DEAD'))
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

  /**
   * 开关 → 打开 PIN 面板。
   * 开启隐私锁**必须先设 PIN**；关闭必须验证 PIN（否则任何拿到手机的人
   * 都能直接把锁关掉，等于没有锁）。
   */
  const handleLockToggle = (next: boolean) => {
    setPinError('')
    setPinInput('')
    setPinConfirm('')
    if (next) {
      setPinSheet('set')
    } else {
      if (!hasPin()) {
        // 历史遗留：开关为开但没有 PIN（v3.1 空壳状态）→ 直接关掉
        setPrivacyLockEnabled(false)
        setLockEnabled(false)
        return
      }
      setPinSheet('verify')
    }
  }

  const closePinSheet = () => {
    if (pinBusy) return
    setPinSheet(null)
    setPinError('')
    setPinInput('')
    setPinConfirm('')
  }

  /** 保存新 PIN（两次输入一致且格式合法） */
  const savePin = async () => {
    if (pinBusy) return
    if (!isValidPin(pinInput)) {
      setPinError('PIN 需为 4–8 位数字')
      return
    }
    if (pinInput !== pinConfirm) {
      setPinError('两次输入的 PIN 不一致')
      return
    }
    setPinBusy(true)
    setPinError('')
    try {
      const ok = await setPin(pinInput)
      if (!ok) {
        setPinError('设置失败，请重试')
        return
      }
      markUnlocked()
      setLockEnabled(true)
      closePinSheet()
    } catch {
      setPinError('设置失败，请重试')
    } finally {
      setPinBusy(false)
    }
  }

  /** 验证 PIN 后关闭隐私锁并清除 PIN */
  const disableLock = async () => {
    if (pinBusy) return
    setPinBusy(true)
    setPinError('')
    try {
      const ok = await verifyPin(pinInput)
      if (!ok) {
        setPinError('PIN 不正确')
        return
      }
      clearPin()
      setLockEnabled(false)
      closePinSheet()
    } catch {
      setPinError('验证失败，请重试')
    } finally {
      setPinBusy(false)
    }
  }

  const total = stats.PENDING + stats.SYNCING + stats.FAILED + stats.DEAD

  return (
    <div className="min-h-dvh bg-[var(--ui-social-bg)] pb-[calc(112px+env(safe-area-inset-bottom))] text-[var(--ui-social-text)] md:pb-28">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_60%_at_50%_-10%,rgba(232,179,106,0.09),transparent_65%)]" />
      <div className="relative mx-auto max-w-2xl px-4 py-6">
        <PullToRefresh onRefresh={load}>
        <header className="mb-8 hidden items-center gap-3 md:flex">
          <div className="ml-auto"><SocialThemeToggle /></div>
          <Link href="/me" className="rounded-full p-2 text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] transition hover:text-[var(--ui-social-text)]"><Icon icon={ArrowLeft} size="md" /></Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--ui-social-accent)]">Sync</p>
            <h1 className="text-xl font-semibold">数据与同步</h1>
          </div>
        </header>

        {/* 移动端：iOS 大标题（带返回键 —— 桌面那个 `hidden md:flex` 的返回箭头在手机上不可见） */}
        <div className="md:hidden">
          <LargeTitle
            title="数据与同步"
            subtitle="离线队列、隐私锁与同步状态"
            back="/me"
            trailing={<SocialThemeToggle />}
          />
        </div>

        {loading ? (
          <div className="py-20 text-center text-[var(--ui-social-faint)]"><Icon icon={Loader2} size="md" className="mx-auto animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['待上传', stats.PENDING],
                ['上传中', stats.SYNCING],
                ['失败', stats.FAILED],
                ['无法同步', stats.DEAD],
              ] as Array<[string, number]>).map(([label, value]) => (
                <div key={label} className="rounded-[1.4rem] bg-[var(--ui-social-surface-80)] p-5 text-center ring-1 ring-[var(--ui-social-line)]">
                  <CountUp value={value} mobileOnly className="text-2xl font-semibold tabular-nums" />
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--ui-social-accent)]">{label}</div>
                </div>
              ))}
            </div>

            {mediaUsage && (
              <p className="mt-3 px-1 text-xs text-[var(--ui-social-muted)]">
                本地媒体占用 {formatMb(mediaUsage.usedBytes)} / {formatMb(mediaUsage.quotaBytes)} · 缩略图 {mediaUsage.thumbCount} 张
              </p>
            )}

            {/*
              引擎内部被隔离的阶段错误。
              价值：本地存储坏掉时「上传阶段照常」是刻意设计，但用户与我都需要看得见
              到底是哪一步坏了 —— 否则又只能靠截图猜（这正是前几版的教训）。
            */}
            {/*
              离线库初始化失败：这时"本地读为空、离线写失败"都不是数据问题，而是存储没起来。
              把它显式说出来，用户与我都不会再把它误判成"网络问题"。
            */}
            {offlineInitError && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--ui-social-surface-50)] px-4 py-3 text-[12px] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)]">
                <Icon icon={AlertCircle} size="sm" className="mt-0.5 shrink-0 text-[var(--ui-social-accent)]" />
                <span>
                  离线存储不可用（离线查看与离线记录会失效，联网时不受影响）：
                  <code className="break-all">{offlineInitError}</code>
                </span>
              </div>
            )}

            {engineError && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--ui-social-surface-50)] px-4 py-3 text-[12px] text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)]">
                <Icon icon={AlertCircle} size="sm" className="mt-0.5 shrink-0 text-[var(--ui-social-accent)]" />
                <span>
                  部分同步步骤失败（已自动隔离，不影响上传）：<code className="break-all">{engineError}</code>
                </span>
              </div>
            )}

            {total === 0 && (
              <div className="mt-6 rounded-[2rem] bg-[var(--ui-social-surface-50)] px-6 py-14 text-center ring-1 ring-[var(--ui-social-line)]">
                <Icon icon={CheckCheck} size="lg" className="mx-auto text-[var(--ui-social-accent)]" />
                <p className="mt-4 text-sm text-[var(--ui-social-muted)]">所有改动都已同步。</p>                <p className="mt-1 text-xs leading-relaxed text-[var(--ui-social-faint)]">离线写的照片、留言、碎碎念会进入队列，联网后自动上传。</p>
                {lastSync && (
                  <p className="mt-3 text-xs text-[var(--ui-social-faint)]">
                    最近同步：{new Date(lastSync.at).toLocaleTimeString('zh-CN')} · 更新 {lastSync.written} 条本地缓存
                  </p>
                )}
              </div>
            )}

            {failed.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--ui-social-accent)]">失败项</h2>
                  <div className="h-px flex-1 bg-[var(--ui-social-line)]" />
                  <button type="button" onClick={retryAll} disabled={busy} className="m-pressable inline-flex items-center gap-1.5 rounded-full bg-[var(--ui-social-surface)] px-4 py-1.5 text-xs text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)] transition hover:text-[var(--ui-social-text)] active:scale-95 disabled:opacity-50">
                    <Icon icon={RefreshCw} size="sm" />全部重试
                  </button>
                </div>
                <Stagger className="mt-4 space-y-2" delayBase={60} step={30}>
                  {failed.map((f) => (
                    <div key={f.id} className="m-pressable flex items-center gap-3 rounded-[1.2rem] bg-[var(--ui-social-surface-80)] px-4 py-3 ring-1 ring-[var(--ui-social-line)]">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{f.entityType} · {f.operation}</div>
                        <div className="mt-0.5 truncate text-xs text-[var(--ui-social-faint)]">
                    {f.status === 'DEAD' ? '已停止自动重试 · ' : ''}
                    {f.lastError || '同步失败'}
                  </div>
                      </div>
                      <button type="button" onClick={() => retryOne(f.id)} disabled={busy} className="rounded-full bg-[var(--ui-social-accent-soft)] px-3 py-1.5 text-xs text-[var(--ui-social-accent)] transition hover:bg-[var(--ui-social-accent)] hover:text-[var(--ui-social-on-accent)] active:scale-95 disabled:opacity-50">重试</button>
                    </div>
                  ))}
                </Stagger>
              </section>
            )}

            {error && <p className="mt-6 text-sm text-[var(--danger-soft)]">{error}</p>}

            {/* C1：本地隐私锁（真实 PIN）+ 数据库加密状态 */}
            <section className="mt-10">
              <Switch
                checked={lockEnabled}
                onCheckedChange={handleLockToggle}
                label="本地隐私锁"
                description="开启需设置 4–8 位数字 PIN；之后每次冷启动进入 App 都要先解锁（Web 端不启用）。"
              />
              <p className="mt-3 px-1 text-xs leading-relaxed text-[var(--ui-social-faint)]">
                本地数据库：
                {encryption.encrypted ? (
                  <span className="text-[var(--m-success)]">已加密（密钥存于 Android Keystore）</span>
                ) : (
                  <span>
                    未加密
                    {encryption.notice ? '（' + encryption.notice + '）' : ''}
                  </span>
                )}
              </p>
            </section>

            {/* PIN 设置 / 验证面板 */}
            <BottomSheet
              open={pinSheet != null}
              onClose={closePinSheet}
              title={pinSheet === 'verify' ? '关闭隐私锁' : '设置隐私锁 PIN'}
            >
              <div className="px-1 pb-4">
                <p className="mb-4 text-sm leading-relaxed text-[var(--ui-social-muted)]">
                  {pinSheet === 'verify'
                    ? '输入当前 PIN 以关闭隐私锁（关闭后将清除 PIN）。'
                    : 'PIN 为 4–8 位数字。忘记 PIN 只能清除应用数据，请设置一个记得住的。'}
                </p>
                <div className="space-y-3">
                  <Field
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={pinSheet === 'verify' ? '输入当前 PIN' : '设置 PIN（4–8 位数字）'}
                    value={pinInput}
                    onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8)); setPinError('') }}
                  />
                  {pinSheet !== 'verify' && (
                    <Field
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="再次输入 PIN"
                      value={pinConfirm}
                      onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8)); setPinError('') }}
                    />
                  )}
                </div>
                {pinError && <p className="mt-3 text-sm text-[var(--m-danger)]">{pinError}</p>}
                <Button
                  block
                  className="mt-5"
                  loading={pinBusy}
                  disabled={pinBusy || pinInput.length < 4}
                  onClick={() => void (pinSheet === 'verify' ? disableLock() : savePin())}
                >
                  {pinSheet === 'verify' ? '验证并关闭' : '保存并开启'}
                </Button>
              </div>
            </BottomSheet>
          </>
        )}
        </PullToRefresh>
      </div>
    </div>
  )
}
