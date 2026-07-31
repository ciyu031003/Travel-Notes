import { prisma } from '../db'

export interface PostImageRecord {
  id: number
  postId: number
  data: Buffer
  mimeType: string
  order: number
}

export interface PostImageOrder {
  id: number
  order: number
}

export interface ImageRepository {
  create(postId: number, data: Buffer, mimeType: string, order: number): Promise<{ id: number }>
  findById(id: number): Promise<PostImageRecord | null>
  delete(id: number): Promise<void>
  getMaxOrder(postId: number): Promise<number>
  findByPostId(postId: number): Promise<PostImageOrder[]>
}

export class PrismaImageRepository implements ImageRepository {
  async create(postId: number, data: Buffer, mimeType: string, order: number): Promise<{ id: number }> {
    const result = await prisma.postImage.create({
      data: {
        postId,
        data: new Uint8Array(data) as any,
        mimeType,
        order,
      },
    })
    return { id: result.id }
  }

  async findById(id: number): Promise<PostImageRecord | null> {
    const result = await prisma.postImage.findUnique({ where: { id } })
    if (!result) return null
    return {
      id: result.id,
      postId: result.postId,
      data: Buffer.from(result.data as any as Uint8Array),
      mimeType: result.mimeType,
      order: result.order,
    }
  }

  async delete(id: number): Promise<void> {
    await prisma.postImage.delete({ where: { id } })
  }

  async getMaxOrder(postId: number): Promise<number> {
    const result = await prisma.postImage.aggregate({
      where: { postId },
      _max: { order: true },
    })
    return result._max.order ?? -1
  }

  async findByPostId(postId: number): Promise<PostImageOrder[]> {
    const results = await prisma.postImage.findMany({
      where: { postId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    })
    return results.map(r => ({ id: r.id, order: r.order }))
  }
}

export const prismaImageRepository = new PrismaImageRepository()
