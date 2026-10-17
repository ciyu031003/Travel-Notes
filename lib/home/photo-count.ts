import type { PostMeta } from '@/components/china-map/types'

/**
 * 首页「照片张数」口径（单一来源）。
 *
 * 为什么要收口：首页有三处要显示同一个数字 —— 足迹地图标记上的「N 张」、
 * 桌面 hero 的统计行、移动端地图覆盖条。口径一旦各写一遍就会漂移
 * （这是本仓反复踩过的坑：列表与单本的画册口径漂移）。
 *
 * 口径本身：一篇文章的照片数 = `images.length`；**旧文章没有 images 时退化为封面 1 张**，
 * 否则会出现「省份被点亮、张数却是 0」的矛盾展示。
 */
export function postPhotoCount(post: PostMeta): number {
  const images = post.images
  if (Array.isArray(images)) return images.length
  return post.cover ? 1 : 0
}

export function totalPhotoCount(posts: PostMeta[]): number {
  return posts.reduce((sum, post) => sum + postPhotoCount(post), 0)
}
