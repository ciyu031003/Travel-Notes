import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
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
      .use(rehypeKatex)
      .use(rehypeSlug)
      .use(rehypeHighlight)
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

