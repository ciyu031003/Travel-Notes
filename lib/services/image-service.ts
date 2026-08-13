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

export class ImageService {
  constructor(
    private readonly imgRepo: ImageRepository,
    private readonly postRepo: PostRepository,
  ) {}

  async upload(postId: number, files: ImageFile[]): Promise<{ urls: string[] }> {
    if (!files || files.length === 0) {
      throw new Error('未上传任何文件')
    }
    if (files.length > MAX_IMAGE_COUNT) {
      throw new Error(`单次最多上传 ${MAX_IMAGE_COUNT} 张图片`)
    }

    const post = await this.postRepo.findById(postId)
    if (!post) {
      throw new Error('文章不存在')
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

  async delete(url: string): Promise<void> {
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
