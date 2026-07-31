import { prisma } from '../db'

export interface RepoMetadata {
  id: number
  name: string
  displayName: string
  description?: string
  language?: string
  stars: number
  cover?: string
  tags: string[]
  repoPath: string
  createdAt: string
  updatedAt: string
}

export interface CreateRepoInput {
  name: string
  displayName: string
  description?: string
  language?: string
  stars?: number
  cover?: string
  tags?: string[]
  repoPath: string
}

export interface UpdateRepoInput {
  displayName?: string
  description?: string
  language?: string
  stars?: number
  cover?: string
  tags?: string[]
  repoPath?: string
}

export interface RepoMetadataRepository {
  findAll(): Promise<RepoMetadata[]>
  findById(id: number): Promise<RepoMetadata | null>
  findByName(name: string): Promise<RepoMetadata | null>
  create(data: CreateRepoInput): Promise<{ id: number }>
  update(id: number, data: UpdateRepoInput): Promise<void>
  delete(id: number): Promise<void>
}

function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return []
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function serializeTags(tags: string[]): string {
  return JSON.stringify(tags)
}

function mapRepo(r: any): RepoMetadata {
  return {
    id: r.id,
    name: r.name,
    displayName: r.displayName,
    description: r.description || undefined,
    language: r.language || undefined,
    stars: r.stars || 0,
    cover: r.cover || undefined,
    tags: parseTags(r.tags),
    repoPath: r.repoPath,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  }
}

export class PrismaRepoMetadataRepository implements RepoMetadataRepository {
  async findAll(): Promise<RepoMetadata[]> {
    try {
      const repos = await prisma.repo.findMany({ orderBy: { stars: 'desc' } })
      return repos.map(mapRepo)
    } catch (error: any) {
      console.error('[PrismaRepoMetadataRepository.findAll] failed:', error?.message)
      return []
    }
  }

  async findById(id: number): Promise<RepoMetadata | null> {
    try {
      const r = await prisma.repo.findUnique({ where: { id } })
      return r ? mapRepo(r) : null
    } catch (error: any) {
      console.error('[PrismaRepoMetadataRepository.findById] failed:', error?.message)
      return null
    }
  }

  async findByName(name: string): Promise<RepoMetadata | null> {
    try {
      const r = await prisma.repo.findUnique({ where: { name } })
      return r ? mapRepo(r) : null
    } catch (error: any) {
      console.error('[PrismaRepoMetadataRepository.findByName] failed:', error?.message)
      return null
    }
  }

  async create(data: CreateRepoInput): Promise<{ id: number }> {
    const r = await prisma.repo.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description || null,
        language: data.language || null,
        stars: data.stars || 0,
        cover: data.cover || null,
        tags: data.tags ? serializeTags(data.tags) : null,
        repoPath: data.repoPath,
      }
    })
    return { id: r.id }
  }

  async update(id: number, data: UpdateRepoInput): Promise<void> {
    const updateData: any = {}
    if (data.displayName !== undefined) updateData.displayName = data.displayName
    if (data.description !== undefined) updateData.description = data.description || null
    if (data.language !== undefined) updateData.language = data.language || null
    if (data.stars !== undefined) updateData.stars = data.stars
    if (data.cover !== undefined) updateData.cover = data.cover || null
    if (data.tags !== undefined) updateData.tags = serializeTags(data.tags)
    if (data.repoPath !== undefined) updateData.repoPath = data.repoPath
    await prisma.repo.update({ where: { id }, data: updateData })
  }

  async delete(id: number): Promise<void> {
    await prisma.repo.delete({ where: { id } })
  }
}
