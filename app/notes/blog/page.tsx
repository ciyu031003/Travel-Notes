import Link from 'next/link'
import { getPosts } from '@/lib/content'
import BlogListWithFilter from '@/components/BlogListWithFilter'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '技术博客 | 学习笔记',
  description: '技术学习笔记、问题排查、经验总结',
}

export default async function TechBlogPage() {
  const posts = await getPosts('tech/blog')

  return (
    <div className="container-custom">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12">
          <h1 className="text-3xl font-bold mb-4">技术博客</h1>
          <p className="text-gray-600 dark:text-gray-400">
            记录学习过程中的笔记、思考和问题解决方案
          </p>
        </header>

        {posts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p>还没有技术文章，开始写下第一篇吧~</p>
          </div>
        ) : (
          <BlogListWithFilter posts={posts} />
        )}
      </div>
    </div>
  )
}
