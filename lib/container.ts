import { PrismaPostRepository } from './repositories/post-repository'
import { PrismaUserRepository } from './repositories/user-repository'
import { PostService } from './services/post-service'
import { AuthService } from './services/auth-service'
import { SiteService } from './services/site-service'
import { MemoryCacheService } from './infrastructure/cache'
import { tokenService } from './services/token-service'

let postServiceInstance: PostService | null = null
let authServiceInstance: AuthService | null = null
let siteServiceInstance: SiteService | null = null
let cacheServiceInstance: MemoryCacheService | null = null

function getCacheService(): MemoryCacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new MemoryCacheService()
  }
  return cacheServiceInstance
}

export function getPostService(): PostService {
  if (!postServiceInstance) {
    const postRepo = new PrismaPostRepository()
    const cache = getCacheService()
    postServiceInstance = new PostService(postRepo, cache)
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

export function resetServices(): void {
  postServiceInstance = null
  authServiceInstance = null
  siteServiceInstance = null
  cacheServiceInstance = null
}
