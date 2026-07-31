import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { remark } from 'remark'
import remarkHtml from 'remark-html'
import remarkGfm from 'remark-gfm'

export interface PostMeta {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  tags?: string[]
  category?: string
  location?: string
}

export interface Post extends PostMeta {
  content: string
  contentHtml: string
}

// 获取指定目录下所有文章
export function getAllPosts(directory: string): PostMeta[] {
  const dirPath = path.join(process.cwd(), 'content', directory)
  
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.md'))
  
  const posts = files.map(filename => {
    const slug = filename.replace('.md', '')
    const fullPath = path.join(dirPath, filename)
    const fileContents = fs.readFileSync(fullPath, 'utf8')
    const { data } = matter(fileContents)
    
    return {
      slug,
      title: data.title || slug,
      date: data.date || new Date().toISOString(),
      description: data.description,
      cover: data.cover,
      tags: data.tags || [],
      category: data.category,
      location: data.location,
    }
  })

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// 获取单篇文章详情
export async function getPostBySlug(directory: string, slug: string): Promise<Post | null> {
  const fullPath = path.join(process.cwd(), 'content', directory, `${slug}.md`)
  
  if (!fs.existsSync(fullPath)) {
    return null
  }

  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const { data, content } = matter(fileContents)

  const processedContent = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(content)
  
  const contentHtml = processedContent.toString()

  return {
    slug,
    title: data.title || slug,
    date: data.date || new Date().toISOString(),
    description: data.description,
    cover: data.cover,
    tags: data.tags || [],
    category: data.category,
    location: data.location,
    content,
    contentHtml,
  }
}
