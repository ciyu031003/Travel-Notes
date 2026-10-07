'use client'

import { useState, useCallback } from 'react'

/**
 * 相册解锁状态机（AlbumUnlockModal / PixelUnlockModal / SpaceUnlockModal 三份
 * 同构逻辑的收敛，1.21.0）。三个弹窗保留各自刻意设计的视觉（旅行暖色 / 像素
 * 存档点 / 银河玻璃，见 check-design-tokens 的主题豁免名单），只共享状态与 API。
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
