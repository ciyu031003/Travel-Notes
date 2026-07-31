'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import LintReport, { LintIssue } from './LintReport'
import MarkdownPreview from './MarkdownPreview'

export interface ImportedDocument {
  title: string
  slug: string
  date: string
  content: string
  tags: string[]
  description?: string
  cover?: string
  frontMatter: Record<string, any>
  embeddedImages: any[]
  issues: LintIssue[]
  isValid: boolean
}

export interface DocumentImporterProps {
  onImported: (doc: ImportedDocument) => void
  afterPublishHref?: string
}

export default function DocumentImporter({
  onImported,
  afterPublishHref = '/admin',
}: DocumentImporterProps) {
  const router = useRouter()
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ImportedDocument | null>(null)
  const [filesDraggedOver, setFilesDraggedOver] = useState(false)
  const [editedMeta, setEditedMeta] = useState({
    title: '',
    slug: '',
    date: '',
    tags: '',
    description: '',
  })
  const [publishing, setPublishing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return

    setParsing(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/posts/import', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `解析失败 (HTTP ${res.status})`)
      }

      const data = await res.json()
      const doc: ImportedDocument = data.data?.doc || data.doc || data
      setResult(doc)
      setEditedMeta({
        title: doc.title || '',
        slug: doc.slug || '',
        date: doc.date || new Date().toISOString().split('T')[0],
        tags: Array.isArray(doc.tags) ? doc.tags.join(', ') : '',
        description: doc.description || '',
      })
    } catch (error: any) {
      alert(error.message || '文件解析失败')
    } finally {
      setParsing(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setFilesDraggedOver(false)
      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFileSelect(files[0])
      }
    },
    [handleFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setFilesDraggedOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setFilesDraggedOver(false)
  }, [])

  const handleFillToEditor = () => {
    if (!result) return
    const finalDoc: ImportedDocument = {
      ...result,
      title: editedMeta.title,
      slug: editedMeta.slug,
      date: editedMeta.date,
      description: editedMeta.description,
      tags: editedMeta.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    onImported(finalDoc)
  }

  const handleOneClickPublish = async () => {
    if (!result || !result.isValid) return

    setPublishing(true)
    try {
      const tagsArray = editedMeta.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const payload = {
        title: editedMeta.title,
        slug: editedMeta.slug,
        description: editedMeta.description,
        type: 'blog',
        content: result.content,
        date: new Date(editedMeta.date).toISOString(),
        tags: tagsArray,
        published: true,
      }

      const res = await fetch('/api/admin/posts/import/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `发布失败 (HTTP ${res.status})`)
      }

      router.push(afterPublishHref)
      router.refresh()
    } catch (error: any) {
      alert(error.message || '发布失败')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          filesDraggedOver
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.docx,.html,.htm,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileSelect(e.target.files[0])
            }
          }}
        />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
            <p className="text-sm text-gray-600 dark:text-gray-300">正在解析文件...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-gray-400" />
            <div>
              <p className="text-base text-gray-700 dark:text-gray-300 font-medium">
                点击或拖拽文档到此处导入
              </p>
              <p className="text-xs text-gray-400 mt-1">
                支持 Markdown (.md)、Word (.docx)、HTML (.html)、纯文本 (.txt)
              </p>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              {result.isValid ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {result.isValid ? '文件解析成功' : '文件解析完成（存在问题）'}
              </h3>
            </div>
            <LintReport issues={result.issues} />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              元数据编辑
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  标题
                </label>
                <input
                  type="text"
                  value={editedMeta.title}
                  onChange={(e) => setEditedMeta({ ...editedMeta, title: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={editedMeta.slug}
                  onChange={(e) => setEditedMeta({ ...editedMeta, slug: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  日期
                </label>
                <input
                  type="date"
                  value={editedMeta.date}
                  onChange={(e) => setEditedMeta({ ...editedMeta, date: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  标签 (逗号分隔)
                </label>
                <input
                  type="text"
                  value={editedMeta.tags}
                  onChange={(e) => setEditedMeta({ ...editedMeta, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="标签1, 标签2"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                描述 / 摘要
              </label>
              <textarea
                value={editedMeta.description}
                onChange={(e) => setEditedMeta({ ...editedMeta, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <MarkdownPreview content={result.content} />

          <div className="flex items-center justify-end gap-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <button
              type="button"
              onClick={handleFillToEditor}
              className="inline-flex items-center gap-2 px-5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              填充到编辑器
            </button>
            <button
              type="button"
              onClick={handleOneClickPublish}
              disabled={!result.isValid || publishing}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  发布中...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  一键发布
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
