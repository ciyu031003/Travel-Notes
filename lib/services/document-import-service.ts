import { randomUUID } from 'crypto'
import path from 'path'
import TurndownService from 'turndown'
import mammoth from 'mammoth'
import { MarkdownRenderer } from '../infrastructure/markdown'

export interface LintIssue {
  severity: 'error' | 'warn' | 'info'
  field: string
  message: string
}

export interface EmbeddedImage {
  name: string
  buffer: Buffer
  mimeType: string
}

export interface ImportedDocument {
  title: string
  slug: string
  date: string
  content: string
  tags: string[]
  description?: string
  cover?: string
  frontMatter: Record<string, any>
  embeddedImages: EmbeddedImage[]
  issues: LintIssue[]
  isValid: boolean
}

const ALLOWED_EXTENSIONS = ['md', 'markdown', 'txt', 'html', 'htm', 'docx']
const REJECTED_EXTENSIONS = ['doc']
const SLUG_REGEX = /^[a-z0-9-]+$/

export class DocumentImportService {
  constructor(
    private readonly markdownRenderer: MarkdownRenderer,
  ) {}

  async import(file: { name: string; buffer: Buffer; mimeType: string }): Promise<ImportedDocument> {
    const ext = path.extname(file.name).slice(1).toLowerCase()

    if (REJECTED_EXTENSIONS.includes(ext)) {
      throw new Error(`不支持的文件格式: .${ext}，请转换为 .docx 后再导入`)
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`不支持的文件格式: .${ext}`)
    }

    const markdownContent = await this.convertToMarkdown(ext, file)
    const { data: frontMatter, content: bodyContent } = this.markdownRenderer.extractFrontMatter(markdownContent)

    const h1Guess = this.extractFirstH1(bodyContent)
    const baseName = path.basename(file.name, path.extname(file.name))

    const title = (frontMatter.title as string) || h1Guess || baseName
    const slug = (frontMatter.slug as string) || this.generateSlug(title)
    const date = (frontMatter.date as string) || new Date().toISOString()
    const tags = Array.isArray(frontMatter.tags) ? frontMatter.tags : []
    const description = frontMatter.description as string | undefined
    const cover = frontMatter.cover as string | undefined

    const embeddedImages: EmbeddedImage[] = []

    const issues = await this.lint(bodyContent, { title, slug, date })
    const isValid = !issues.some(i => i.severity === 'error')

    return {
      title,
      slug,
      date,
      content: bodyContent,
      tags,
      description,
      cover,
      frontMatter,
      embeddedImages,
      issues,
      isValid,
    }
  }

  private async convertToMarkdown(ext: string, file: { buffer: Buffer }): Promise<string> {
    switch (ext) {
      case 'md':
      case 'markdown':
      case 'txt':
        return file.buffer.toString('utf-8')

      case 'html':
      case 'htm': {
        const html = file.buffer.toString('utf-8')
        const turndown = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
        })
        return turndown.turndown(html)
      }

      case 'docx': {
        const result = await mammoth.convertToHtml({
          arrayBuffer: file.buffer.buffer as ArrayBuffer,
        })
        const turndown = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
        })
        return turndown.turndown(result.value)
      }

      default:
        throw new Error(`不支持的文件格式: .${ext}`)
    }
  }

  private async lint(
    content: string,
    meta: { title: string; slug: string; date: string }
  ): Promise<LintIssue[]> {
    const issues: LintIssue[] = []

    if (!SLUG_REGEX.test(meta.slug)) {
      issues.push({
        severity: 'error',
        field: 'slug',
        message: 'Slug 只能包含小写字母、数字和连字符',
      })
    }

    const h1Count = this.countH1(content)
    if (h1Count > 1) {
      issues.push({
        severity: 'error',
        field: 'content',
        message: `H1 标题数量为 ${h1Count}，建议只保留一个`,
      })
    }

    if (h1Count === 0) {
      issues.push({
        severity: 'warn',
        field: 'content',
        message: '未检测到 H1 标题',
      })
    }

    const jumps = this.detectHeadingJumps(content)
    if (jumps.length > 0) {
      issues.push({
        severity: 'warn',
        field: 'content',
        message: `检测到标题层级跳级: ${jumps.join(', ')}`,
      })
    }

    const unlabeled = this.countUnlabeledCodeBlocks(content)
    if (unlabeled > 0) {
      issues.push({
        severity: 'warn',
        field: 'content',
        message: `${unlabeled} 个代码块未标注语言（\`\`\` 后缺少语言标识）`,
      })
    }

    const wordCount = this.countBodyWords(content)
    if (wordCount < 100) {
      issues.push({
        severity: 'warn',
        field: 'content',
        message: `内容字数不足 100 字（当前约 ${wordCount} 字）`,
      })
    }

    return issues
  }

  private extractFirstH1(content: string): string | undefined {
    const lines = content.split('\n')
    const inCodeBlock = { value: false }
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock.value = !inCodeBlock.value
        continue
      }
      if (inCodeBlock.value) continue
      const m = line.match(/^#\s+(.+)$/)
      if (m) return m[1].trim()
    }
    return undefined
  }

  private countH1(content: string): number {
    const lines = content.split('\n')
    let count = 0
    const inCodeBlock = { value: false }
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock.value = !inCodeBlock.value
        continue
      }
      if (inCodeBlock.value) continue
      if (/^#\s+/.test(line)) count++
    }
    return count
  }

  private detectHeadingJumps(content: string): string[] {
    const lines = content.split('\n')
    const jumps: string[] = []
    let prevLevel = 0
    const inCodeBlock = { value: false }
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock.value = !inCodeBlock.value
        continue
      }
      if (inCodeBlock.value) continue
      const m = line.match(/^(#{1,6})\s/)
      if (m) {
        const level = m[1].length
        if (prevLevel > 0 && level > prevLevel + 1) {
          jumps.push(`H${prevLevel} → H${level}`)
        }
        prevLevel = level
      }
    }
    return jumps
  }

  private countUnlabeledCodeBlocks(content: string): number {
    const lines = content.split('\n')
    let count = 0
    const inCodeBlock = { value: false }
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('```')) {
        if (!inCodeBlock.value) {
          const lang = trimmed.replace(/^```/, '').trim()
          if (lang.length === 0) count++
        }
        inCodeBlock.value = !inCodeBlock.value
      }
    }
    return count
  }

  private countBodyWords(content: string): number {
    const stripped = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/[*_~`>-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    const chineseChars = (stripped.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = stripped
      .replace(/[\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0).length

    return chineseChars + englishWords
  }

  private generateSlug(title: string): string {
    const base = title
      .toLowerCase()
      .trim()
      .replace(/[\u4e00-\u9fa5]+/g, (m) => {
        return Array.from(m).map(() => '').join('')
      })
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    const suffix = randomUUID().slice(0, 6)

    if (base.length === 0) {
      return `post-${suffix}`
    }

    return `${base}-${suffix}`
  }
}
