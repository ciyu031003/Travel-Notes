import fs from 'fs'
import path from 'path'
import type { FileNode } from './types'

export type { FileNode }

// 获取所有代码仓库项目
export function getAllRepos(): string[] {
  const reposDir = path.join(process.cwd(), 'content', 'tech', 'repos')
  
  if (!fs.existsSync(reposDir)) {
    return []
  }

  return fs.readdirSync(reposDir).filter(item => {
    const itemPath = path.join(reposDir, item)
    return fs.statSync(itemPath).isDirectory()
  })
}

// 获取项目的文件树
export function getRepoFileTree(repoName: string): FileNode | null {
  const repoPath = path.join(process.cwd(), 'content', 'tech', 'repos', repoName)
  
  if (!fs.existsSync(repoPath)) {
    return null
  }

  function buildTree(dirPath: string, relativePath: string = ''): FileNode {
    const name = path.basename(dirPath) || repoName
    const stat = fs.statSync(dirPath)

    if (stat.isDirectory()) {
      const children = fs.readdirSync(dirPath)
        .filter(item => !item.startsWith('.') && item !== 'node_modules')
        .map(item => {
          const itemPath = path.join(dirPath, item)
          const itemRelativePath = relativePath ? `${relativePath}/${item}` : item
          return buildTree(itemPath, itemRelativePath)
        })

      return {
        name,
        path: relativePath || name,
        type: 'directory',
        children,
      }
    } else {
      return {
        name,
        path: relativePath || name,
        type: 'file',
        language: getLanguage(name),
      }
    }
  }

  return buildTree(repoPath, '')
}

// 获取文件内容
export function getFileContent(repoName: string, filePath: string): string | null {
  const fullPath = path.join(process.cwd(), 'content', 'tech', 'repos', repoName, filePath)
  
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return null
  }

  try {
    return fs.readFileSync(fullPath, 'utf8')
  } catch {
    return null
  }
}

// 根据文件名获取语言类型
function getLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const langMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.cpp': 'cpp',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.md': 'markdown',
    '.sh': 'bash',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sql': 'sql',
  }
  return langMap[ext] || 'plaintext'
}

// 获取项目 README
export function getRepoReadme(repoName: string): string | null {
  const readmePath = path.join(process.cwd(), 'content', 'tech', 'repos', repoName, 'README.md')
  
  if (!fs.existsSync(readmePath)) {
    return null
  }

  return fs.readFileSync(readmePath, 'utf8')
}
