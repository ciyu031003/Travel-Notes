'use client'

import { useEffect, useState } from 'react'
import UserList from '@/components/social/UserList'
import { apiUrl } from '@/lib/api-base'

export default function FollowersPage() {
  const [id, setId] = useState<number | null>(null)

  useEffect(() => {
    fetch(apiUrl('/api/me'), { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (j?.data?.id) setId(j.data.id) })
      .catch(() => {})
  }, [])

  if (!id) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">加载中…</div>
  }
  return <UserList endpoint={'/api/social/users/' + id + '/followers'} title="我的粉丝" />
}
