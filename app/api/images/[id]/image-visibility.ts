import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { isSiteOwner } from '@/lib/site-owner'

/**
 * 内容图（PostImage）读权限判定（P0-4 / S-5）。
 *
 * 规则：
 *  · 文章「已发布 且 公开」→ 任何人可读，且响应可被公开缓存；
 *  · 其他情况（草稿 / 私密）→ 只有作者本人或站点主人可读，且响应 private, no-store；
 *  · 其余一律不可读，调用方统一返回 404（与"不存在"同响应，杜绝存在性探测）。
 *
 * 为什么作者/主人对草稿也放行：后台编辑器需要预览尚未发布的图片；
 * 而「敌人」是匿名遍历 /api/images/1..N —— 那类请求既不是作者也不是主人，一律 404。
 */
export interface ImageVisibility {
  allowed: boolean
  /** true = 内容对所有人可见，可发 public 缓存头（仅当 post.published && post.isPublic） */
  publicRead: boolean
}

export async function checkPostImageVisibility(request: NextRequest, postId: number): Promise<ImageVisibility> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { published: true, isPublic: true, userId: true },
  })
  if (!post) return { allowed: false, publicRead: false }

  if (post.published && post.isPublic) return { allowed: true, publicRead: true }

  // 非公开：必须判定当前访问者是否是作者/站点主人；会话无效或数据库异常一律按未登录（fail-closed）
  const auth = await requireAuth(request)
  const userId = auth.authenticated ? auth.payload?.userId ?? null : null
  if (userId == null) return { allowed: false, publicRead: false }
  if (post.userId != null && post.userId === userId) return { allowed: true, publicRead: false }
  if (await isSiteOwner(userId)) return { allowed: true, publicRead: false }
  return { allowed: false, publicRead: false }
}
