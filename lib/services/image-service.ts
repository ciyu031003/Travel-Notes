import { prisma } from '../db'
import { ImageRepository } from '../repositories/image-repository'
import { PostRepository, UpdatePostInput } from '../repositories/post-repository'
import {
  validateAndSanitizeImage,
  MAX_IMAGE_COUNT,
} from '../infrastructure/media-validation'

export interface ImageFile {
  name: string
  buffer: Buffer
  mimeType: string
}

/**
 * 媒体操作的执行者（P0-4）。
 *
 * 为什么必须显式传入：POST /api/upload 原先只校验「已登录」，postId 直接进服务层，
 * 于是任意登录用户都能给**别人的文章**塞图（IDOR），也能凭 /api/images/N 删别人的图。
 * 归属校验放在服务层（而不是只靠路由），后续任何新调用方都躲不过。
 */
export interface MediaActor {
  /** 当前登录用户 id（匿名不该走到写路径，类型上允许以便统一判权） */
  userId: number | null | undefined
  /** 站点主人：可管理全站图片；其他用户只能管自己文章下的图 */
  isSiteOwner: boolean
}

/**
 * 统一的媒体权限错误。
 *
 * 调用方把它映射成 403（写）或 404（读/删）——**绝不能在响应里区分
 * 「图片不存在」与「图片不属于你」**，否则等于给攻击者一个存在性探测接口。
 */
export class MediaAccessError extends Error {
  constructor(message = '无权操作该图片') {
    super(message)
    this.name = 'MediaAccessError'
  }
}

/** actor 能否管理某篇文章下的图片：站长，或文章作者本人 */
function canManagePost(postOwnerId: number | null | undefined, actor: MediaActor | undefined): boolean {
  if (!actor) return true // 兼容：未传 actor 的旧调用方（admin 导入发布路由）保持原行为
  if (actor.isSiteOwner) return true
  if (actor.userId == null) return false
  // 历史数据 userId 为空（schema 注释：归首个管理员）时只有站长能动
  return postOwnerId != null && postOwnerId === actor.userId
}

/**
 * 读取文章归属（不受可见性过滤）。
 *
 * 为什么不复用 PostRepository.findById：它的 select 里**没有 userId**
 * （mapPostMeta 会永远拿到 null），拿不到归属就没法判权。这里只查一列。
 */
async function findPostOwnerId(postId: number): Promise<number | null | undefined> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true },
  })
  return post ? post.userId ?? null : undefined
}

export class ImageService {
  constructor(
    private readonly imgRepo: ImageRepository,
    private readonly postRepo: PostRepository,
  ) {}

  async upload(postId: number, files: ImageFile[], actor?: MediaActor): Promise<{ urls: string[] }> {
    if (!files || files.length === 0) {
      throw new Error('未上传任何文件')
    }
    if (files.length > MAX_IMAGE_COUNT) {
      throw new Error(`单次最多上传 ${MAX_IMAGE_COUNT} 张图片`)
    }

    const post = await this.postRepo.findById(postId)
    if (!post) {
      // 与「不是你的文章」同错：不泄露 postId 是否存在
      throw new MediaAccessError('文章不存在或无权限')
    }

    // P0-4 归属校验，必须在写任何数据之前：否则任意登录用户可给他人文章塞图
    if (actor) {
      const ownerId = await findPostOwnerId(postId)
      if (!canManagePost(ownerId, actor)) {
        throw new MediaAccessError('文章不存在或无权限')
      }
    }

    // 逐张校验 + 重新编码（剥离元数据），任一失败则整体拒绝
    const sanitized: Array<{ buffer: Buffer; mimeType: string }> = []
    for (const file of files) {
      try {
        const result = await validateAndSanitizeImage(file.buffer, file.mimeType)
        sanitized.push({ buffer: result.buffer, mimeType: result.mimeType })
      } catch (err: any) {
        throw new Error(`${file.name}: ${err.message}`)
      }
    }

    const createdIds: number[] = []

    for (let i = 0; i < sanitized.length; i++) {
      const file = sanitized[i]
      const maxOrder = await this.imgRepo.getMaxOrder(postId)
      const nextOrder = maxOrder + 1
      const result = await this.imgRepo.create(postId, file.buffer, file.mimeType, nextOrder)
      createdIds.push(result.id)
    }

    let existingIds: number[] = []
    const postDetail = await this.postRepo.findById(postId)
    if (postDetail && postDetail.images) {
      try {
        const parsed = postDetail.images
        existingIds = parsed
          .map((v: string) => {
            const match = v.match(/\/api\/images\/(\d+)/)
            return match ? parseInt(match[1], 10) : NaN
          })
          .filter((v: number) => !isNaN(v))
      } catch {}
    }

    const allIds = [...existingIds, ...createdIds]

    const needCoverUpdate =
      !postDetail?.cover ||
      postDetail.cover === '' ||
      postDetail.cover.startsWith('/uploads/')

    const updateData: UpdatePostInput = {
      images: allIds.map(id => `/api/images/${id}`),
    }
    if (needCoverUpdate && allIds.length > 0) {
      updateData.cover = `/api/images/${allIds[0]}`
    }

    await this.postRepo.update(postId, updateData)

    const urls = createdIds.map(id => `/api/images/${id}`)
    return { urls }
  }

  async delete(url: string, actor?: MediaActor): Promise<void> {
    if (!url || !url.startsWith('/api/images/')) {
      throw new Error('无效的资源路径')
    }

    const imageId = parseInt(url.replace('/api/images/', ''), 10)
    if (isNaN(imageId)) {
      throw new Error('无效的图片 ID')
    }

    const image = await this.imgRepo.findById(imageId)
    if (!image) {
      throw new Error('图片不存在')
    }

    const postId = image.postId

    /**
     * P0-4：删除前先校验归属（原先任何登录用户都能凭 URL 删任何人的图）。
     * 无权与不存在抛同一个错误，由路由映射 404，不给存在性探测。
     */
    if (actor) {
      const ownerId = await findPostOwnerId(postId)
      if (!canManagePost(ownerId, actor)) {
        throw new MediaAccessError('图片不存在或无权限')
      }
    }

    await this.imgRepo.delete(imageId)

    const remaining = await this.imgRepo.findByPostId(postId)
    const remainingIds = remaining.map(r => r.id)

    const post = await this.postRepo.findById(postId)
    if (post) {
      const newCover = post.cover === url
        ? (remainingIds.length > 0 ? `/api/images/${remainingIds[0]}` : undefined)
        : post.cover

      await this.postRepo.update(postId, {
        images: remainingIds.map(id => `/api/images/${id}`),
        cover: newCover,
      })
    }
  }
}
