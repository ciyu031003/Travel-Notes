'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { goBackOrHome } from '@/lib/navigation'

/** MainActivity 的 AndroidX 返回回调入口；先关最顶层弹层，再返回应用内页面。 */
export default function NativeBackHandler() {
  const router = useRouter()
  useEffect(() => {
    const target = window as Window & { __tiantuHandleBack?: () => void }
    target.__tiantuHandleBack = () => {
      const event = new Event('tiantu:native-back', { cancelable: true })
      if (!window.dispatchEvent(event)) return
      goBackOrHome(router)
    }
    return () => { delete target.__tiantuHandleBack }
  }, [router])
  return null
}
