'use client'

import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Folder, File, FileCode, Search, SearchX } from 'lucide-react'
import type { FileNode } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FileTreeProps {
  tree: FileNode
  onFileClick: (path: string) => void
  activePath?: string
}

// 兼容两种类型标记：lib/types 用 'directory'，repo-repository 返回 'dir'
function isDirectory(node: FileNode): boolean {
  return node.type === 'directory' || (node as { type?: string }).type === 'dir'
}

export default function FileTree({ tree, onFileClick, activePath }: FileTreeProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTree = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return tree
    return filterTree(tree, query)
  }, [tree, searchQuery])

  const isSearching = searchQuery.trim().length > 0

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索文件..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-green-400"
        />
      </div>

      {filteredTree ? (
        <div className="text-sm">
          <TreeNode
            node={filteredTree}
            level={0}
            onFileClick={onFileClick}
            activePath={activePath}
            defaultOpen={true}
            forceOpen={isSearching}
          />
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <SearchX className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">未找到匹配文件</p>
        </div>
      )}
    </div>
  )
}

function filterTree(node: FileNode, query: string): FileNode | null {
  const nameMatch = node.name.toLowerCase().includes(query)
  const dir = isDirectory(node)

  if (!dir) {
    return nameMatch ? node : null
  }

  const children = node.children || []
  const filteredChildren = children
    .map((c) => filterTree(c, query))
    .filter((c): c is FileNode => c !== null)

  if (nameMatch) {
    return { ...node, children }
  }
  if (filteredChildren.length > 0) {
    return { ...node, children: filteredChildren }
  }
  return null
}

interface TreeNodeProps {
  node: FileNode
  level: number
  onFileClick: (path: string) => void
  activePath?: string
  defaultOpen?: boolean
  forceOpen?: boolean
}

function TreeNode({ node, level, onFileClick, activePath, defaultOpen = false, forceOpen = false }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const effectiveOpen = forceOpen ? true : isOpen

  const isActive = activePath === node.path
  const dir = isDirectory(node)

  if (dir) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full flex items-center gap-1 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left',
            isActive && 'bg-green-50 dark:bg-green-900/20'
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {effectiveOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
          )}
          <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          <span className="truncate text-gray-700 dark:text-gray-300">{node.name}</span>
        </button>
        {effectiveOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                level={level + 1}
                onFileClick={onFileClick}
                activePath={activePath}
                forceOpen={forceOpen}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onFileClick(node.path)}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left',
        isActive && 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
      )}
      style={{ paddingLeft: `${level * 16 + 28}px` }}
    >
      {isCodeFile(node.name) ? (
        <FileCode className="w-4 h-4 text-gray-500 flex-shrink-0" />
      ) : (
        <File className="w-4 h-4 text-gray-500 flex-shrink-0" />
      )}
      <span className="truncate text-gray-700 dark:text-gray-300">{node.name}</span>
    </button>
  )
}

function isCodeFile(filename: string): boolean {
  const codeExts = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.c', '.cpp',
    '.h', '.hpp', '.cs', '.html', '.css', '.scss', '.less', '.json', '.sh',
    '.bash', '.sql', '.yaml', '.yml', '.xml', '.toml', '.ini', '.vue',
    '.svelte', '.rb', '.php', '.swift', '.kt', '.scala',
  ]
  return codeExts.some((ext) => filename.toLowerCase().endsWith(ext))
}
