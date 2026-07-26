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

  try {
    const dbPosts = await getDBPosts(dbType)
    if (dbPosts.length > 0) {
      return dbPosts.map(post => ({
        slug: post.slug,
        title: post.title,
        date: post.date,
        description: post.description,
        cover: post.cover,
        images: post.images,
        tags: post.tags,
        location: post.location,
        category: post.type,
      }))
    }
  } catch {}

  return getMarkdownPosts(directory)
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
  } catch {}

  return await getMarkdownPost(directory, slug)
}
