'use client'

import Link from 'next/link'
import { useEffect, useId, useRef } from 'react'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { CalendarDays, Lock, X } from '@/lib/mobile/icon-system'
import { hapticError, hapticSuccess } from '@/lib/mobile/haptics'
import { markOverlayNavigation } from '@/hooks/use-close-on-back'
import { useAlbumUnlock } from '@/hooks/use-album-unlock'
import { useModalLayer } from '@/hooks/use-modal-layer'

interface AlbumLockDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** 说明文案（三处入口可按语境微调，视觉与交互完全一致） */
  description?: string
  /** 是否展示「没有纪念日？直接进入相册」逃生口（服务端无口令时放行） */
  showSkip?: boolean
}

/**
 * 相册上锁弹窗 —— 全 App 唯一的现代锁屏弹窗。
 *
 * 为什么收敛成一份：1.30.1 之前同一件「输入纪念日解锁」的事有三套皮
 * （像素存档点 / 银河玻璃 / 旅行暖色），用户看到的是三种完全不同的界面，
 * 且像素皮与整体移动端 UI 语言冲突。现在像素/银河双皮肤整体移除，
 * 相册页、登录页等其它入口、银河页共用这一份实现：
 *
 *  · 视觉：V6 语言（暖粉奶油底、衬线标题、20px 圆角白卡、柔和阴影、圆形玻璃关闭键）；
 *  · 状态机：仍走 hooks/use-album-unlock（密码 = 纪念日字符串，格式解析在服务端）；
 *  · 交互契约（与旧实现逐条对齐）：自动聚焦、提交中态、错误 aria-live、
 *    ESC / 安卓返回键关闭（useModalLayer：焦点圈定 + 背景 inert + 滚动锁）、
 *    「想修改纪念日？」→ /me/album-lock、「没有纪念日？直接进入相册」逃生口。
 */
export default function AlbumLockDialog({
  isOpen,
  onClose,
  onSuccess,
  description = '输入纪念日，打开你们的纪念相册',
  showSkip = true,
}: AlbumLockDialogProps) {
  // P2-B2：统一弹层基座（焦点圈定/恢复、背景 inert、滚动锁、ESC/返回键）
  const panelRef = useRef<HTMLDivElement>(null)
  useModalLayer({ open: isOpen, onClose, panelRef })

  const uid = useId()
  const { password, setPassword, error, verifying, submit, skip, close } = useAlbumUnlock({
    onClose,
    onSuccess: () => {
      void hapticSuccess()
      onSuccess()
    },
  })

  // 失败时给一次错误触觉（规范 §7：解锁失败 = hapticError）
  useEffect(() => {
    if (error) void hapticError()
  }, [error])

  if (!isOpen) return null

  return (
    <div
      className="lock-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-title`}
      aria-describedby={`${uid}-desc`}
    >
      <div className="lock-dialog lock-card relative w-full max-w-[352px] px-5 pb-4 pt-7">
        <div className="flex flex-col items-center text-center">
          <span className="lock-emblem lock-emblem--sm">
            <Icon icon={Lock} size="lg" />
          </span>
          <h2
            id={`${uid}-title`}
            className="lock-serif mt-3.5 text-[24px] leading-[30px] text-[var(--m-text)]"
          >
            相册已上锁
          </h2>
          <p id={`${uid}-desc`} className="mt-1.5 text-[13px] leading-[18px] text-[var(--m-muted)]">
            {description}
          </p>
        </div>

        <form onSubmit={submit} className="mt-5">
          <label
            htmlFor={`${uid}-date`}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--m-muted)]"
          >
            <Icon icon={CalendarDays} size="sm" tone="faint" />
            纪念日
          </label>
          <div className="m-field-control mt-1.5">
            <input
              id={`${uid}-date`}
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="m-field-input lock-date-input"
              placeholder="如 2023-06-20"
              required
              autoFocus
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={error ? true : undefined}
              aria-describedby={`${uid}-hint`}
              disabled={verifying}
            />
          </div>
          <p id={`${uid}-hint`} className="mt-2 text-[11px] leading-[16px] text-[var(--m-faint)]">
            支持 2023-06-20 / 2023/06/20 / 2023年06月20日
          </p>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-3 rounded-[12px] bg-[var(--m-tone-clay-bg)] px-3 py-2 text-[13px] leading-[18px] font-medium text-[var(--m-danger)]"
            >
              {error}
            </p>
          )}

          <Button type="submit" block size="lg" loading={verifying} className="mt-4">
            {verifying ? '正在解锁…' : '解锁相册'}
          </Button>
        </form>

        <div className="mt-1 flex flex-col items-center">
          <Link
            href="/me/album-lock"
            onClick={() => {
              // 弹层内导航：先打标记再关闭，否则 useCloseOnBack 的卸载清理会把
              // 即将完成的跳转 history.back 顶回 /album（实测「点了没反应」）
              markOverlayNavigation()
              close()
            }}
            className="m-pressable flex min-h-11 items-center gap-1 px-2 text-[13px] font-medium text-[var(--m-muted)] underline decoration-[var(--m-line-strong)] underline-offset-4"
          >
            想修改纪念日？
          </Link>
          {showSkip && (
            <button
              type="button"
              onClick={skip}
              disabled={verifying}
              className="m-pressable flex min-h-11 items-center px-2 text-[13px] font-semibold text-[var(--m-accent-strong)] disabled:opacity-50"
            >
              没有纪念日？直接进入相册
            </button>
          )}
        </div>

        {/* 关闭键放在 DOM 末尾：焦点圈定的首个可聚焦元素因此是日期输入框（自动聚焦不被抢） */}
        <button
          type="button"
          onClick={close}
          aria-label="关闭"
          className="lock-glass-btn absolute right-3 top-3"
        >
          <Icon icon={X} size="sm" />
        </button>
      </div>
    </div>
  )
}
