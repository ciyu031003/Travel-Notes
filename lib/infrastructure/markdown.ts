import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'
import rehypeRaw from 'rehype-raw'
import matter from 'gray-matter'

export interface TocItem {
  level: number
  text: string
  id: string
}

export interface RenderedContent {
  html: string
  toc: TocItem[]
  headings: TocItem[]
  wordCount: number
  readMinutes: number
}

export interface MarkdownRenderer {
  render(content: string, options?: { extractToc?: boolean }): Promise<RenderedContent>
  extractToc(html: string): TocItem[]
  extractFrontMatter(content: string): { data: Record<string, any>; content: string }
}

/**
 * Markdown 输出安全边界（XSS 防护）：
 * - 基于 rehype-sanitize 默认白名单，剥离 <script>、事件属性、javascript: 协议、
 *   <object>/<embed>/<iframe> 等危险内容
 * - 额外放行：语法高亮 className、TOC id、GFM 任务列表、KaTeX MathML
 */
const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // KaTeX MathML 所需标签
    'math', 'semantics', 'mrow', 'mfrac', 'mi', 'mo', 'mn', 'msup', 'msub',
    'msubsup', 'msqrt', 'mroot', 'mtext', 'merror', 'mpadded', 'mphantom',
    'mspace', 'mtable', 'mtr', 'mtd', 'mover', 'munder', 'munderover',
    'menclose', 'mstyle', 'annotation',
  ],
  attributes: {
    ...(defaultSchema.attributes || {}),
    '*': [
      ...((defaultSchema.attributes as any)?.['*'] || []),
      'className',
      'data-marker',
    ],
    // 语法高亮 / Mermaid 代码块的语言类名
    code: [
      ...((defaultSchema.attributes as any)?.code || []),
      ['className', /^language-[a-zA-Z0-9_-]+$/],
    ],
    // GFM 任务列表
    input: [
      ['type', 'checkbox'],
      'checked',
      'disabled',
    ],
    // 链接：仅允许 http(s)/mailto（默认协议白名单已限制 javascript: 等）
    a: [
      ...((defaultSchema.attributes as any)?.a || []),
      'target',
      'rel',
    ],
    img: [
      ...((defaultSchema.attributes as any)?.img || []),
      'loading',
      'referrerPolicy',
    ],
    math: ['xmlns', 'display'],
    annotation: ['encoding'],
  },
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export class UnifiedMarkdownRenderer implements MarkdownRenderer {
  async render(content: string, options?: { extractToc?: boolean }): Promise<RenderedContent> {
    const { data, content: body } = this.extractFrontMatter(content)

    const file = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeKatex)
      .use(rehypeSlug)
      .use(rehypeHighlight)
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(body)

    const html = String(file)
    const toc = options?.extractToc ? this.extractTocFromMarkdown(body) : this.extractToc(html)
    const wordCount = this.countWords(body)
    const readMinutes = Math.ceil(wordCount / 200)

    return {
      html,
      toc,
      headings: toc,
      wordCount,
      readMinutes: Math.max(1, readMinutes),
    }
  }

  extractToc(html: string): TocItem[] {
    const headingRegex = /<h([23])(?:\s+id="([^"]*)")?[^>]*>(.*?)<\/h\1>/g
    const toc: TocItem[] = []
    let match

    while ((match = headingRegex.exec(html)) !== null) {
      const level = parseInt(match[1], 10)
      const rawId = match[2]
      const rawText = match[3]
      const text = this.stripHtmlTags(rawText).trim()
      const id = rawId || slugify(text)
      toc.push({ level, text, id })
    }

    return toc
  }

  private extractTocFromMarkdown(content: string): TocItem[] {
    const lines = content.split('\n')
    const toc: TocItem[] = []
    const inCodeBlock = { value: false }

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock.value = !inCodeBlock.value
        continue
      }
      if (inCodeBlock.value) continue

      const headingMatch = line.match(/^(#{2,3})\s+(.+)$/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const text = headingMatch[2].trim()
        const id = slugify(text)
        toc.push({ level, text, id })
      }
    }

    return toc
  }

  extractFrontMatter(content: string): { data: Record<string, any>; content: string } {
    try {
      const result = matter(content)
      return {
        data: result.data as Record<string, any>,
        content: result.content,
      }
    } catch {
      return { data: {}, content }
    }
  }

  private stripHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '')
  }

  private countWords(content: string): number {
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
      .filter((w) => w.length > 0)
      .length

    return chineseChars + englishWords
  }
}

export const unifiedMarkdownRenderer = new UnifiedMarkdownRenderer()

