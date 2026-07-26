import { getAllPosts as getMarkdownPosts, getPostBySlug as getMarkdownPost } from './markdown'
import { getDBPosts, getDBPostBySlug } from './db-posts'

export async function getPosts(directory: string): Promise<any[]> {
  const typeMap: Record<string, string> = {
    'travel': 'travel',
    'tech/blog': 'blog',
    'tech/mindmaps': 'mindmap',
    'tech/repos': 'repo',
  }

  const dbType = typeMap[directory] || directory

  const allPosts: any[] = []

  try {
    const dbPosts = await getDBPosts(dbType)
    allPosts.push(...dbPosts.map(post => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      date: post.date,
      description: post.description,
      cover: post.cover,
      images: post.images,
      tags: post.tags,
      location: post.location,
      category: post.type,
    })))
  } catch (error: any) {
    console.error('[getPosts] getDBPosts failed:', error?.message || error)
  }

  try {
    const markdownPosts = await getMarkdownPosts(directory)
    const dbSlugs = new Set(allPosts.map(p => p.slug))
    markdownPosts.forEach(post => {
      if (!dbSlugs.has(post.slug)) {
        allPosts.push(post)
      }
    })
  } catch {}

  allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return allPosts
}

export async function getPostBySlug(directory: string, slug: string) {
  const typeMap: Record<string, string> = {
    'travel': 'travel',
    'tech/blog': 'blog',
    'tech/mindmaps': 'mindmap',
    'tech/repos': 'repo',
  }

  const dbType = typeMap[directory] || directory

  try {
    const dbPost = await getDBPostBySlug(dbType, slug)
    if (dbPost) {
      return {
        id: dbPost.id,
        slug: dbPost.slug,
        title: dbPost.title,
        date: dbPost.date,
        description: dbPost.description,
        cover: dbPost.cover,
        images: dbPost.images,
        tags: dbPost.tags,
        location: dbPost.location,
        category: dbPost.type,
        contentHtml: dbPost.contentHtml,
      }
    }
  } catch (error: any) {
    console.error('[getPostBySlug] getDBPostBySlug failed:', error?.message || error)
  }

  return await getMarkdownPost(directory, slug)
}
