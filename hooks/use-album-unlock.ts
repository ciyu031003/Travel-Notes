'use client'

import { useState, useCallback } from 'react'

/**
 * 相册解锁状态机（1.21.0 收敛了三份同构逻辑）。
 *
 * 1.30.1 起「输入纪念日解锁」只剩一套现代界面（components/album/AlbumLockDialog，
 * 锁屏页 AlbumUnlockScreen 与其它入口共用），像素存档点 / 银河玻璃两套皮肤已整体移除；
 * 本 hook 的职责不变：口令 = 纪念日字符串，格式解析在 /api/verify-album-password。
 */
export function useAlbumUnlock(options: {
  onClose: () => void
  onSuccess: () => void
}) {
  const { onClose, onSuccess } = options
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const close = useCallback(() => {
    setPassword('')
    setError('')
    onClose()
  }, [onClose])

  const verify = useCallback(async (body: Record<string, unknown>, fallbackError: string) => {
    setVerifying(true)
    try {
      const res = await fetch('/api/verify-album-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setPassword('')
        setError('')
        onClose()
        onSuccess()
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error || fallbackError)
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setVerifying(false)
    }
  }, [onClose, onSuccess])

  /** 输入纪念日解锁 */
  const submit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      void verify({ date: password }, '验证失败')
    },
    [verify, password],
  )

  /** 无纪念日用户直接进入（服务端无密码时放行）——仅旅行暖色壳暴露该入口 */
  const skip = useCallback(() => {
    void verify({ skip: true }, '无法进入相册')
  }, [verify])

  return { password, setPassword, error, verifying, submit, skip, close }
}
