'use client'

import Link from 'next/link'

import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'

interface AuditItem {
  id: number
  username: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN: { label: '登录', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300' },
  LOGOUT: { label: '退出', color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300' },
  CREATE: { label: '创建', color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300' },
  UPDATE: { label: '更新', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' },
  DELETE: { label: '删除', color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' },
  UPLOAD_MEDIA: { label: '上传媒体', color: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300' },
  DELETE_MEDIA: { label: '删除媒体', color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' },
  INVITE_MEMBER: { label: '邀请成员', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300' },
  UPDATE_PERMISSIONS: { label: '权限变更', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300' },
  CHANGE_PASSWORD: { label: '修改密码', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' },
  SETTINGS_UPDATE: { label: '设置变更', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' },
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/audit')
      .then((res) => res.json())
      .then((data) => setLogs(data.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回后台
        </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">审计日志</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          记录登录、退出、内容变更、媒体上传与权限操作（最近 100 条）
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          加载中...
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">暂无审计记录</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                  <th className="px-4 py-3 font-medium">资源</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const meta = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300' }
                  return (
                    <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-200">{log.username}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                        {log.resourceType ? `${log.resourceType}#${log.resourceId || ''}` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
