'use client'

import { AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'

export interface LintIssue {
  severity: 'error' | 'warn' | 'info'
  field: string
  message: string
}

export interface LintReportProps {
  issues: LintIssue[]
}

export default function LintReport({ issues }: LintReportProps) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warn')
  const infos = issues.filter((i) => i.severity === 'info')
  const totalChecks = issues.length > 0 ? Math.max(1, 10 - errors.length) : 10
  const passedChecks = Math.max(0, totalChecks - errors.length - warnings.length)

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden bg-red-50 dark:bg-red-900/10">
          <div className="px-4 py-3 bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-medium">
              <AlertCircle className="w-5 h-5" />
              {errors.length} 个错误
            </div>
          </div>
          <ul className="divide-y divide-red-100 dark:divide-red-900/30">
            {errors.map((issue, idx) => (
              <li key={`err-${idx}`} className="px-4 py-3 flex gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-red-700 dark:text-red-300">
                    {issue.field}
                  </div>
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {issue.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="border border-yellow-200 dark:border-yellow-800 rounded-xl overflow-hidden bg-yellow-50 dark:bg-yellow-900/10">
          <div className="px-4 py-3 bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 font-medium">
              <AlertTriangle className="w-5 h-5" />
              {warnings.length} 个警告
            </div>
          </div>
          <ul className="divide-y divide-yellow-100 dark:divide-yellow-900/30">
            {warnings.map((issue, idx) => (
              <li key={`warn-${idx}`} className="px-4 py-3 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                    {issue.field}
                  </div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">
                    {issue.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {infos.length > 0 && (
        <div className="border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden bg-blue-50 dark:bg-blue-900/10">
          <div className="px-4 py-3 bg-blue-100 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
              <Info className="w-5 h-5" />
              {infos.length} 条信息
            </div>
          </div>
          <ul className="divide-y divide-blue-100 dark:divide-blue-900/30">
            {infos.map((issue, idx) => (
              <li key={`info-${idx}`} className="px-4 py-3 flex gap-3">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {issue.field}
                  </div>
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    {issue.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            通过 {passedChecks} 项检查
          </span>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {errors.length} 错误 / {warnings.length} 警告
        </div>
      </div>
    </div>
  )
}
