import { getAllPosts as getMarkdownPosts, getPostBySlug as getMarkdownPost } from './markdown'
import { getDBPosts, getDBPostBySlug, PostMetaDB, VideoInfo } from './db-posts'
import { appCache } from './cache'

const CONTENT_CACHE_TTL = 120000
const META_CACHE_TTL = 30000

const typeMap: Record<string, string> = {
  'travel': 'travel',
  'tech/blog': 'blog',
  'tech/mindmaps': 'mindmap',
  'tech/repos': 'repo',
}

interface EnrichedPost extends PostMetaDB {
  category: string
}

export async function getPosts(directory: string): Promise<EnrichedPost[]> {
  const dbType = typeMap[directory] || directory
  const cacheKey = `posts:list:${dbType}`

  return appCache.getOrSet(
    cacheKey,
    async () => {
      const allPosts: EnrichedPost[] = []

      try {
        const dbPosts = await getDBPosts(dbType)
        allPosts.push(...dbPosts.map(post => ({
          ...post,
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
            allPosts.push({
              id: 0,
              slug: post.slug,
              title: post.title,
              date: post.date,
              description: post.description,
              cover: post.cover,
              images: [],
              videos: [],
              tags: post.tags || [],
              location: post.location,
              type: post.category || directory,
              published: true,
              category: post.category || directory,
            })
          }
        })
      } catch {}

      allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      return allPosts
    },
    META_CACHE_TTL,
    [`posts:${dbType}`]
  )
}

export async function getPostBySlug(directory: string, slug: string) {
  const dbType = typeMap[directory] || directory
  const cacheKey = `posts:detail:${dbType}:${slug}`

  return appCache.getOrSet(
    cacheKey,
    async () => {
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
            videos: dbPost.videos,
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
    },
    CONTENT_CACHE_TTL,
    [`posts:${dbType}`, `post:${slug}`]
  )
}

export function clearPostCacheByType(type: string): void {
  appCache.deleteByTag(`posts:${type}`)
}

export function clearPostCacheBySlug(type: string, slug: string): void {
  appCache.delete(`posts:detail:${type}:${slug}`)
}

export function clearAllPostCache(): void {
  const stats = appCache.getStats()
  console.log(`[Cache] Clearing post cache. Stats: ${JSON.stringify(stats)}`)
  appCache.clearByPrefix('posts:')
}
