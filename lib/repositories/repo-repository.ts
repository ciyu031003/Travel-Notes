// 元数据 CRUD 见 lib/repositories/repo-metadata-repository.ts
import fs from 'fs'
import path from 'path'
import { getAllRepos, getRepoFileTree, getFileContent, getRepoReadme } from '../repos'
import type { FileNode as LegacyFileNode } from '../types'

export interface RepoMeta {
  name: string
  displayName?: string
  description?: string
  readmePath?: string
  language?: string
  stars?: number
  cover?: string
  tags?: string[]
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
  language?: string
  size?: number
}

export interface RepoRepository {
  getAll(): Promise<RepoMeta[]>
  getFileTree(repo: string): Promise<FileNode | null>
  getFileContent(repo: string, filePath: string): Promise<{ content: string; language: string } | null>
}

function convertLegacyFileNode(node: LegacyFileNode): FileNode {
  return {
    name: node.name,
    path: node.path,
    type: node.type === 'directory' ? 'dir' : node.type,
    children: node.children ? node.children.map(convertLegacyFileNode) : undefined,
    language: node.language,
  }
}

function inferDisplayName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export class FsRepoRepository implements RepoRepository {
  async getAll(): Promise<RepoMeta[]> {
    const repoNames = getAllRepos()
    const results: RepoMeta[] = []

    for (const name of repoNames) {
      const meta: RepoMeta = {
        name,
        displayName: inferDisplayName(name),
      }

      const readme = getRepoReadme(name)
      if (readme) {
        meta.readmePath = 'README.md'
        const firstLine = readme.split('\n').find((l) => l.startsWith('# '))
        if (firstLine) {
          meta.displayName = firstLine.replace(/^#\s+/, '').trim()
        }
        const descMatch = readme.match(/^#\s+.+\n+([\s\S]+?)(?=\n##|\n#|$)/)
        if (descMatch) {
          meta.description = descMatch[1].trim().slice(0, 200)
        }
      }

      results.push(meta)
    }

    return results
  }

  async getFileTree(repo: string): Promise<FileNode | null> {
    const tree = getRepoFileTree(repo)
    if (!tree) return null
    const result = convertLegacyFileNode(tree)
    await this.attachFileSizes(repo, result)
    return result
  }

  private async attachFileSizes(repo: string, node: FileNode): Promise<void> {
    const fullPath = path.join(process.cwd(), 'content', 'tech', 'repos', repo, node.path)
    try {
      if (node.type === 'file') {
        const stat = fs.statSync(fullPath)
        node.size = stat.size
      } else if (node.children) {
        for (const child of node.children) {
          await this.attachFileSizes(repo, child)
        }
      }
    } catch {}
  }

  async getFileContent(repo: string, filePath: string): Promise<{ content: string; language: string } | null> {
    const content = getFileContent(repo, filePath)
    if (content === null) return null
    const language = this.getLanguage(path.basename(filePath))
    return { content, language }
  }

  private getLanguage(filename: string): string {
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
      '.htm': 'html',
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
}

export const PrismaRepoRepository = FsRepoRepository

export const fsRepoRepository = new FsRepoRepository()
