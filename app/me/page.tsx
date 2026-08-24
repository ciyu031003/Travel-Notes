'use client'

import { useEffect, useState } from 'react'
import MeHome from '@/components/social/MeHome'
import AsyncState from '@/components/AsyncState'
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
    return <AsyncState variant="error" message={error} title="个人档案加载失败" />
  }
  if (!profile) {
    return <AsyncState variant="loading" message="正在加载你的旅行档案…" />
  }
  return <MeHome initial={profile} />
}
