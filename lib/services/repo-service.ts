import { revalidatePath } from 'next/cache'
import { RepoRepository, RepoMeta, FileNode } from '../repositories/repo-repository'
import {
  RepoMetadataRepository,
  RepoMetadata,
  CreateRepoInput,
  UpdateRepoInput,
} from '../repositories/repo-metadata-repository'
import { CacheService } from '../infrastructure/cache'

export class RepoService {
  private readonly CACHE_TTL_REPOS = 600

  constructor(
    private readonly repoRepo: RepoRepository,
    private readonly repoMetadataRepo: RepoMetadataRepository,
    private readonly cache: CacheService,
  ) {}

  async getAllRepos(): Promise<RepoMeta[]> {
    const cacheKey = 'repos:all'
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const [dbRepos, fsRepos] = await Promise.all([
          this.repoMetadataRepo.findAll(),
          this.repoRepo.getAll(),
        ])
        const dbMap = new Map(dbRepos.map((r) => [r.name, r]))
        return fsRepos.map((fs) => {
          const db = dbMap.get(fs.name)
          if (db) {
            return {
              name: db.name,
              displayName: db.displayName || fs.displayName,
              description: db.description || fs.description,
              readmePath: fs.readmePath,
              language: db.language,
              stars: db.stars,
              cover: db.cover,
              tags: db.tags,
            } as RepoMeta
          }
          return fs
        })
      },
      this.CACHE_TTL_REPOS,
      ['repos']
    )
  }

  async getAllReposWithMetadata(): Promise<RepoMetadata[]> {
    const cacheKey = 'repos:metadata:all'
    return this.cache.getOrSet(
      cacheKey,
      async () => this.repoMetadataRepo.findAll(),
      this.CACHE_TTL_REPOS,
      ['repos']
    )
  }

  async getRepoById(id: number): Promise<RepoMetadata | null> {
    const cacheKey = `repos:metadata:id:${id}`
    return this.cache.getOrSet(
      cacheKey,
      async () => this.repoMetadataRepo.findById(id),
      this.CACHE_TTL_REPOS,
      ['repos']
    )
  }

  async getRepoByName(name: string): Promise<RepoMetadata | null> {
    const cacheKey = `repos:metadata:name:${name}`
    return this.cache.getOrSet(
      cacheKey,
      async () => this.repoMetadataRepo.findByName(name),
      this.CACHE_TTL_REPOS,
      ['repos']
    )
  }

  async createRepo(input: CreateRepoInput): Promise<{ id: number }> {
    const existing = await this.repoMetadataRepo.findByName(input.name)
    if (existing) {
      throw new Error(`仓库 "${input.name}" 已存在`)
    }
    const result = await this.repoMetadataRepo.create(input)
    await this.cache.deleteByTag('repos')
    this.invalidateIsrCache()
    return result
  }

  async updateRepo(id: number, input: UpdateRepoInput): Promise<void> {
    await this.repoMetadataRepo.update(id, input)
    await this.cache.deleteByTag('repos')
    this.invalidateIsrCache()
  }

  async deleteRepo(id: number): Promise<void> {
    await this.repoMetadataRepo.delete(id)
    await this.cache.deleteByTag('repos')
    this.invalidateIsrCache()
  }

  async getRepoFiles(repo: string): Promise<FileNode | null> {
    const cacheKey = `repos:files:${repo}`
    return this.cache.getOrSet(
      cacheKey,
      async () => this.repoRepo.getFileTree(repo),
      this.CACHE_TTL_REPOS,
      ['repos', `repos:${repo}`]
    )
  }

  /** 仓库元数据变更后失效 Next.js ISR 缓存。 */
  private invalidateIsrCache(): void {
    try {
      revalidatePath('/notes')
      revalidatePath('/notes/repo')
      revalidatePath('/notes/repo/[repo]', 'page')
    } catch {
      // 构建期或无权调用时忽略
    }
  }

  async getRepoFile(repo: string, filePath: string): Promise<{ content: string; language: string } | null> {
    const cacheKey = `repos:file:${repo}:${filePath}`
    return this.cache.getOrSet(
      cacheKey,
      async () => this.repoRepo.getFileContent(repo, filePath),
      this.CACHE_TTL_REPOS,
      ['repos', `repos:${repo}`]
    )
  }
}
