import { PrismaPostRepository } from './repositories/post-repository'
import { PrismaUserRepository } from './repositories/user-repository'
import { PrismaImageRepository } from './repositories/image-repository'
import { PrismaRepoRepository } from './repositories/repo-repository'
import { PrismaRepoMetadataRepository } from './repositories/repo-metadata-repository'
import { PostService } from './services/post-service'
import { AuthService } from './services/auth-service'
import { SiteService } from './services/site-service'
import { ImageService } from './services/image-service'
import { RepoService } from './services/repo-service'
import { DocumentImportService } from './services/document-import-service'
import { UnifiedMarkdownRenderer } from './infrastructure/markdown'
import { MemoryCacheService } from './infrastructure/cache'
import { tokenService } from './services/token-service'
import { prismaTokenBlacklistRepository } from './repositories/token-blacklist-repository'

// 服务端启动时将持久化黑名单仓库注入 TokenService（保持客户端包不含 Prisma）
tokenService.attachBlacklistRepository(prismaTokenBlacklistRepository)

let postServiceInstance: PostService | null = null
let authServiceInstance: AuthService | null = null
let siteServiceInstance: SiteService | null = null
let imageServiceInstance: ImageService | null = null
let repoServiceInstance: RepoService | null = null
let repoMetadataRepoInstance: PrismaRepoMetadataRepository | null = null
let markdownRendererInstance: UnifiedMarkdownRenderer | null = null
let documentImportServiceInstance: DocumentImportService | null = null
let cacheServiceInstance: MemoryCacheService | null = null

function getCacheService(): MemoryCacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new MemoryCacheService()
  }
  return cacheServiceInstance
}

function getRepoMetadataRepository(): PrismaRepoMetadataRepository {
  if (!repoMetadataRepoInstance) {
    repoMetadataRepoInstance = new PrismaRepoMetadataRepository()
  }
  return repoMetadataRepoInstance
}

export function getPostService(): PostService {
  if (!postServiceInstance) {
    const postRepo = new PrismaPostRepository()
    const cache = getCacheService()
    const markdownRenderer = getMarkdownRenderer()
    postServiceInstance = new PostService(postRepo, cache, markdownRenderer)
  }
  return postServiceInstance
}

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    const userRepo = new PrismaUserRepository()
    authServiceInstance = new AuthService(userRepo, tokenService)
  }
  return authServiceInstance
}

export function getSiteService(): SiteService {
  if (!siteServiceInstance) {
    const userRepo = new PrismaUserRepository()
    const cache = getCacheService()
    siteServiceInstance = new SiteService(userRepo, cache)
  }
  return siteServiceInstance
}

export function getImageService(): ImageService {
  if (!imageServiceInstance) {
    const imgRepo = new PrismaImageRepository()
    const postRepo = new PrismaPostRepository()
    const cache = getCacheService()
    imageServiceInstance = new ImageService(imgRepo, postRepo)
  }
  return imageServiceInstance
}

export function getRepoService(): RepoService {
  if (!repoServiceInstance) {
    const repoRepo = new PrismaRepoRepository()
    const metadataRepo = getRepoMetadataRepository()
    const cache = getCacheService()
    repoServiceInstance = new RepoService(repoRepo, metadataRepo, cache)
  }
  return repoServiceInstance
}

export function getMarkdownRenderer(): UnifiedMarkdownRenderer {
  if (!markdownRendererInstance) {
    markdownRendererInstance = new UnifiedMarkdownRenderer()
  }
  return markdownRendererInstance
}

export function getDocumentImportService(): DocumentImportService {
  if (!documentImportServiceInstance) {
    const renderer = getMarkdownRenderer()
    documentImportServiceInstance = new DocumentImportService(renderer)
  }
  return documentImportServiceInstance
}

export function resetServices(): void {
  postServiceInstance = null
  authServiceInstance = null
  siteServiceInstance = null
  imageServiceInstance = null
  repoServiceInstance = null
  repoMetadataRepoInstance = null
  markdownRendererInstance = null
  documentImportServiceInstance = null
  cacheServiceInstance = null
}
