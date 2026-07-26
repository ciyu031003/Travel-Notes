'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, File, FileCode } from 'lucide-react'
import type { FileNode } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FileTreeProps {
  tree: FileNode
  onFileClick: (path: string) => void
  activePath?: string
}

export default function FileTree({ tree, onFileClick, activePath }: FileTreeProps) {
  return (
    <div className="text-sm">
      <TreeNode
        node={tree}
        level={0}
        onFileClick={onFileClick}
        activePath={activePath}
        defaultOpen={true}
      />
    </div>
  )
}

interface TreeNodeProps {
  node: FileNode
  level: number
  onFileClick: (path: string) => void
  activePath?: string
  defaultOpen?: boolean
}

function TreeNode({ node, level, onFileClick, activePath, defaultOpen = false }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const isActive = activePath === node.path

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full flex items-center gap-1 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left',
            isActive && 'bg-blue-50 dark:bg-blue-900/30'
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
          )}
          <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children && (
          <div>
            {node.children.map(child => (
              <TreeNode
                key={child.path}
                node={child}
                level={level + 1}
                onFileClick={onFileClick}
                activePath={activePath}
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
        isActive && 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
      )}
      style={{ paddingLeft: `${level * 16 + 28}px` }}
    >
      {isCodeFile(node.name) ? (
        <FileCode className="w-4 h-4 text-gray-500 flex-shrink-0" />
      ) : (
        <File className="w-4 h-4 text-gray-500 flex-shrink-0" />
      )}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

function isCodeFile(filename: string): boolean {
  const codeExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.html', '.css', '.json', '.sh', '.sql', '.yaml', '.yml']
  return codeExts.some(ext => filename.endsWith(ext))
}
