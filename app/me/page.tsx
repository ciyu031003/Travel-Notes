'use client'

import { useEffect, useState } from 'react'
import MeHome from '@/components/social/MeHome'
import { apiUrl } from '@/lib/api-base'

export default function MePage() {
  const [profile, setProfile] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(apiUrl('/api/me'), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.data) setProfile(j.data)
        else setError('个人档案加载失败')
      })
      .catch(() => setError('网络错误，请稍后重试'))
  }, [])

  if (error) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">{error}</div>
  }
  if (!profile) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">加载中…</div>
  }
  return <MeHome initial={profile} />
}
