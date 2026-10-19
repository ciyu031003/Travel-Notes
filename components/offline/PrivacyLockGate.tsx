'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { Delete, Lock } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { hapticError, hapticLight, hapticSuccess } from '@/lib/mobile/haptics'
import {
  isPrivacyLockSupported,
  lockState,
  markUnlocked,
  verifyPin,
} from '@/lib/modules/offline/privacy-lock'
import { useModalLayer } from '@/hooks/use-modal-layer'

const MIN_PIN_LENGTH = 4
const MAX_PIN_LENGTH = 8

/**
 * 冷启动隐私锁门禁（C1）。
 *
 * 行为：
 *  · 仅在原生壳、且**设置过 PIN 并开启开关**时出现（Web 永不出现）；
 *  · 覆盖全屏（z-200，高于 Toast/Sheet/编辑器），任何页面都点不进去；
 *  · 解锁后本次会话放行（privacy-lock 的 sessionStorage 标记），
 *    热启动/切页面不会反复弹；App 被杀后下次冷启动重新要求输入。
 *
 * 为什么 mounted 后才渲染：SSR/静态导出时没有 localStorage，
 * 直接渲染会在首帧闪一下再消失（WebView 里表现为白屏闪动）。这里先渲染 null，
 * 挂载后同步读一次本地状态再决定是否出锁 —— 闪动窗口为零。
 */
export default function PrivacyLockGate() {
  const [ready, setReady] = useState(false)
  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // P2-B2：统一弹层基座（焦点圈定/恢复、背景 inert、滚动锁、ESC/返回键）
  const panelRef = useRef<HTMLDivElement>(null)
  useModalLayer({
    open: locked,
    onClose: () => {},
    dismissible: false,
    panelRef,
  })

  useEffect(() => {
    if (!isPrivacyLockSupported()) {
      setReady(true)
      return
    }
    try {
      setLocked(lockState().locked)
    } catch {
      // 读不到状态时按"未启用"处理，避免把用户永久关在门外（数据仍受数据库加密保护）
    }
    setReady(true)
  }, [])

  const submit = useCallback(async () => {
    if (busy || pin.length < MIN_PIN_LENGTH) return
    setBusy(true)
    setError('')
    try {
      const ok = await verifyPin(pin)
      if (ok) {
        markUnlocked()
        void hapticSuccess()
        setPin('')
        setLocked(false)
      } else {
        void hapticError()
        setError('PIN 不正确，请重试')
        setPin('')
      }
    } catch {
      void hapticError()
      setError('校验失败，请重试')
    } finally {
      setBusy(false)
    }
  }, [busy, pin])

  const press = (digit: string) => {
    if (busy) return
    void hapticLight()
    setError('')
    setPin((prev) => (prev.length >= MAX_PIN_LENGTH ? prev : prev + digit))
  }

  const backspace = () => {
    if (busy) return
    void hapticLight()
    setError('')
    setPin((prev) => prev.slice(0, -1))
  }

  // 挂载前 / 未启用 / 已解锁：不渲染任何东西（避免 SSR 闪烁与无意义遮罩）
  if (!ready || !locked) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex min-h-dvh flex-col items-center justify-center bg-[var(--m-bg)] px-6"
      ref={panelRef} tabIndex={-1} role="dialog"
      aria-modal="true"
      aria-label="本地隐私锁"
      data-privacy-lock="1"
    >
      <div className="flex w-full max-w-xs flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]">
          <Icon icon={Lock} size="lg" />
        </div>
        <h1 className="mt-4 text-[18px] font-bold tracking-[-0.02em] text-[var(--m-text)]">本地隐私锁</h1>
        <p className="mt-1.5 text-center text-sm text-[var(--m-muted)]">输入 PIN 解锁，仅本次打开有效</p>

        {/* PIN 圆点 */}
        <div className="mt-6 flex h-9 items-center justify-center gap-2.5" aria-live="polite">
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={
                'h-2.5 w-2.5 rounded-full transition-colors ' +
                (i < pin.length ? 'bg-[var(--m-accent-strong)]' : 'bg-[var(--m-line-strong)]')
              }
            />
          ))}
        </div>

        {error && (
          <p className="mt-3 text-sm text-[var(--m-danger)]" role="alert">
            {error}
          </p>
        )}

        {/* 数字键盘 */}
        <div className="mt-6 grid w-full grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              aria-label={'数字 ' + d}
              className="m-pressable h-14 rounded-[var(--m-radius-control)] bg-[var(--m-surface-solid)] text-[18px] font-semibold text-[var(--m-text)] ring-1 ring-[var(--m-line)] active:scale-95"
            >
              {d}
            </button>
          ))}
          <span aria-hidden="true" />
          <button
            type="button"
            onClick={() => press('0')}
            aria-label="数字 0"
            className="m-pressable h-14 rounded-[var(--m-radius-control)] bg-[var(--m-surface-solid)] text-[18px] font-semibold text-[var(--m-text)] ring-1 ring-[var(--m-line)] active:scale-95"
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            aria-label="删除一位"
            disabled={pin.length === 0 || busy}
            className="m-pressable flex h-14 items-center justify-center rounded-[var(--m-radius-control)] text-[var(--m-muted)] active:scale-95 disabled:opacity-40"
          >
            <Icon icon={Delete} size="md" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={pin.length < MIN_PIN_LENGTH || busy}
          className="mt-5 h-12 w-full rounded-[var(--m-radius-control)] bg-[var(--m-cta-bg)] text-[15px] font-semibold text-[var(--m-on-accent)] active:scale-[0.99] disabled:opacity-40"
        >
          {busy ? '校验中…' : '解锁'}
        </button>

        <p className="mt-4 text-center text-xs leading-relaxed text-[var(--m-faint)]">
          忘记 PIN 需要清除应用数据（本地离线缓存会丢失，云端数据不受影响）
        </p>
      </div>
    </div>
  )
}
