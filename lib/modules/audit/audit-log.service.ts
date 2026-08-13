/**
 * AuditLog：记录关键操作（登录/退出/增删改/权限变更/上传等）。
 * 对情侣共同编辑场景具有审计价值。
 */
import { prisma } from '../../db'
import { hashIp } from '../../services/auth-service'

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'UPLOAD_MEDIA'
  | 'DELETE_MEDIA'
  | 'INVITE_MEMBER'
  | 'UPDATE_PERMISSIONS'
  | 'CHANGE_PASSWORD'
  | 'SETTINGS_UPDATE'

export interface AuditLogInput {
  username: string
  action: AuditAction
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown> | null
  ip?: string | null
  spaceId?: number | null
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        username: input.username,
        action: input.action as any,
        resourceType: input.resourceType || null,
        resourceId: input.resourceId || null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        ipHash: hashIp(input.ip),
        spaceId: input.spaceId || null,
      },
    })
  } catch (error) {
    // 审计日志写入失败不应影响主流程
    console.error('[AuditLog] write failed:', (error as Error)?.message)
  }
}

export async function listAuditLogs(options: { limit?: number; username?: string; action?: string } = {}): Promise<
  Array<{
    id: number
    username: string
    action: string
    resourceType: string | null
    resourceId: string | null
    metadata: Record<string, unknown> | null
    createdAt: string
  }>
> {
  const { limit = 100, username, action } = options
  const where: any = {}
  if (username) where.username = username
  if (action) where.action = action
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    metadata: r.metadata ? safeParse(r.metadata) : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
