import { getPostService } from '@/lib/container'
import BlogToolbar from '@/components/blog/BlogToolbar'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '技术博客 | 学习笔记',
  description: '技术学习笔记、问题排查、经验总结',
}

export default async function TechBlogPage() {
  const postService = getPostService()
  const [posts, allTags] = await Promise.all([
    postService.getPostsHybrid('tech/blog'),
    postService.getAllTags('blog'),
  ])

  return (
    <div className="container-custom">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">技术博客</h1>
          <p className="text-gray-600 dark:text-gray-300">
            记录学习过程中的笔记、思考和问题解决方案
          </p>
        </header>

        {posts.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <p>还没有技术文章，开始写下第一篇吧~</p>
          </div>
        ) : (
          <BlogToolbar posts={posts} allTags={allTags} basePath="/notes/blog" />
        )}
      </div>
    </div>
  )
}
