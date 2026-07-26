'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Folder, File } from 'lucide-react'
import FileTree from '@/components/repo/FileTree'
import CodeViewer from '@/components/repo/CodeViewer'
import type { FileNode } from '@/lib/types'

export default function RepoDetailPage() {
  const params = useParams()
  const repoName = params?.repo as string
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [currentNode, setCurrentNode] = useState<FileNode | null>(null)
  const [fileTree, setFileTree] = useState<FileNode | null>(null)
  const [readme, setReadme] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repoName) return
    const fetchRepoData = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/repos/${repoName}`)
        if (!res.ok) {
          throw new Error('Failed to fetch repo')
        }
        const data = await res.json()
        setFileTree(data.tree)
        setReadme(data.readme)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load repo')
      } finally {
        setLoading(false)
      }
    }
    fetchRepoData()
  }, [repoName])

  const handleFileClick = async (path: string) => {
    setActiveFile(path)
    try {
      const res = await fetch(`/api/repos/${repoName}/files?path=${encodeURIComponent(path)}`)
      if (!res.ok) {
        throw new Error('Failed to fetch file')
      }
      const data = await res.json()
      setFileContent(data.content)

      const findNode = (node: FileNode): FileNode | null => {
        if (node.path === path) return node
        if (node.children) {
          for (const child of node.children) {
            const found = findNode(child)
            if (found) return found
          }
        }
        return null
      }

      if (fileTree) {
        const node = findNode(fileTree)
        setCurrentNode(node)
      }
    } catch (err) {
      setFileContent(null)
      setCurrentNode(null)
    }
  }

  if (loading) {
    return (
      <div className="container-custom">
        <div className="text-center py-16 text-gray-500">
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !fileTree) {
    return (
      <div className="container-custom">
        <div className="text-center py-16 text-gray-500">
          <Folder className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>{error || '仓库不存在'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container-custom">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/notes/repo"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-primary-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回代码仓库
        </Link>
        <h1 className="text-2xl font-bold">{repoName}</h1>
      </div>

      <div className="flex gap-6">
        <div className="w-64 flex-shrink-0">
          <div className="card p-4 sticky top-24">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Folder className="w-4 h-4" />
              文件目录
            </h3>
            <FileTree
              tree={fileTree}
              onFileClick={handleFileClick}
              activePath={activeFile || undefined}
            />
          </div>
        </div>

        <div className="flex-1">
          {fileContent && currentNode ? (
            <CodeViewer
              code={fileContent}
              language={currentNode.language || 'plaintext'}
              filename={currentNode.name}
            />
          ) : (
            <div className="card p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <File className="w-5 h-5" />
                README.md
              </h3>
              {readme ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {readme}
                </div>
              ) : (
                <p className="text-gray-500">暂无 README 文件</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
