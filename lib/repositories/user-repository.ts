import { prisma } from '../db'
import { updateCredentials, initializeCredentialsFromEnv } from '../auth'

/** 忘记密码流程需要的最小用户字段（不回读整行） */
export interface UserEmailRecord {
  id: number
  username: string
  emailVerified: boolean
}

/**
 * 用户账号仓储。
 *
 * B11 清理：旧接口里 7 个「按 id 升序找首用户再写」的方法（updateEmail / setEmailVerified /
 * updateAnniversaryStart / generateResetToken / verifyResetToken / resetPasswordWithToken /
 * clearResetToken）已确认**没有任何调用方**，随写路径收敛一并删除；站点配置的读取由
 * lib/auth.ts 的 getSiteSettings（只读兼容）负责，不再经仓储暴露。
 */
export interface UserRepository {
  /** 写入账号凭据（按显式 username 定位，见 lib/auth.updateCredentials） */
  updateCredentials(username: string, passwordHash: string, email?: string | null, clearRequireChange?: boolean): Promise<void>
  /** 引导初始化（只在库里没有任何用户时按 env 创建） */
  initializeFromEnv(): Promise<void>
  /** 忘记密码：按邮箱精确取用户（不再回退「首个用户」） */
  findByEmail(email: string): Promise<UserEmailRecord | null>
  /** 忘记密码：按用户 id 更新密码（只作用于该用户） */
  updatePasswordById(id: number, passwordHash: string): Promise<void>
}

export class PrismaUserRepository implements UserRepository {
  async updateCredentials(
    username: string,
    passwordHash: string,
    email?: string | null,
    clearRequireChange: boolean = false
  ): Promise<void> {
    await updateCredentials(username, passwordHash, email, clearRequireChange)
  }

  async initializeFromEnv(): Promise<void> {
    await initializeCredentialsFromEnv()
  }

  async findByEmail(email: string): Promise<UserEmailRecord | null> {
    const normalized = String(email || '').trim()
    if (!normalized) return null
    return prisma.user.findFirst({
      where: { email: normalized },
      select: { id: true, username: true, emailVerified: true },
    })
  }

  async updatePasswordById(id: number, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } })
  }
}

export const prismaUserRepository = new PrismaUserRepository()
