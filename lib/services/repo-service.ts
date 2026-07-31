import { RepoRepository, RepoMeta, FileNode } from '../repositories/repo-repository'
import { CacheService } from '../infrastructure/cache'

export class RepoService {
  private readonly CACHE_TTL_REPOS = 600

  constructor(
    private readonly repoRepo: RepoRepository,
    private readonly cache: CacheService,
  ) {}

  async getAllRepos(): Promise<RepoMeta[]> {
    const cacheKey = 'repos:all'
    return this.cache.getOrSet(
      cacheKey,
      async () => this.repoRepo.getAll(),
      this.CACHE_TTL_REPOS,
      ['repos']
    )
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
