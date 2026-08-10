import fs from 'fs'
import path from 'path'
import type { FileNode } from './types'

export type { FileNode }

function getReposRoot(): string {
  return path.resolve(process.cwd(), 'content', 'tech', 'repos')
}

/**
 * 安全解析仓库目录：确保解析结果始终位于 content/tech/repos 内。
 * 返回 null 表示非法（路径逃逸、空目录名等）。
 */
function safeRepoDir(repoName: string): string | null {
  if (typeof repoName !== 'string' || repoName.length === 0) return null
  const reposRoot = getReposRoot()
  const repoDir = path.resolve(reposRoot, repoName)
  const rel = path.relative(reposRoot, repoDir)
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return null
  }
  return repoDir
}

/**
 * 安全解析仓库内文件路径：确保解析结果严格位于该仓库目录内。
 * 返回 null 表示非法（绝对路径、包含 .. 逃逸、反斜杠等）。
 */
function safeRepoFilePath(repoName: string, filePath: string): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0) return null
  if (path.isAbsolute(filePath) || filePath.includes('\\')) return null
  const repoDir = safeRepoDir(repoName)
  if (!repoDir) return null
  const fullPath = path.resolve(repoDir, filePath)
  const rel = path.relative(repoDir, fullPath)
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return null
  }
  return fullPath
}

// 获取所有代码仓库项目
export function getAllRepos(): string[] {
  const reposDir = getReposRoot()

  if (!fs.existsSync(reposDir)) {
    return []
  }

  return fs.readdirSync(reposDir).filter(item => {
    const itemPath = path.join(reposDir, item)
    return safeRepoDir(item) !== null && fs.statSync(itemPath).isDirectory()
  })
}

// 获取项目的文件树
export function getRepoFileTree(repoName: string): FileNode | null {
  const repoPath = safeRepoDir(repoName)

  if (!repoPath || !fs.existsSync(repoPath)) {
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
  const fullPath = safeRepoFilePath(repoName, filePath)

  if (!fullPath || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
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
    '.h': 'c',
    '.hpp': 'cpp',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.json': 'json',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.sh': 'bash',
    '.bash': 'bash',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sql': 'sql',
    '.xml': 'xml',
    '.toml': 'toml',
    '.ini': 'ini',
    '.env': 'bash',
  }
  return langMap[ext] || 'plaintext'
}

// 获取项目 README
export function getRepoReadme(repoName: string): string | null {
  const readmePath = safeRepoFilePath(repoName, 'README.md')

  if (!readmePath || !fs.existsSync(readmePath)) {
    return null
  }

  return fs.readFileSync(readmePath, 'utf8')
}
