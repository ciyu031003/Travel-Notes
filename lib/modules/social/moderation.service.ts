/**
 * v3.1 M3-B2：社交治理处理闭环。
 * 后台处理举报：驳回（DISMISSED）/ 下架帖子（帖子隐藏 + 通知作者）/ 隐藏评论 / 封禁用户（拉黑作者 + 通知）。
 * 统一入口：handleReport(action, reportId)，由 /api/admin/social/reports 路由调用（canManageSocial 能力）。
 */
import { prisma } from '@/lib/db'
import { logger } from '@/lib/infrastructure/logger'

export type ReportAction = 'DISMISS' | 'TAKEDOWN_POST' | 'HIDE_COMMENT' | 'BAN_USER'

/** 系统通知（治理结果告知被举报者；actorId=null 表示系统） */
async function systemNotify(recipientId: number, refType: string, refId: number, message: string): Promise<void> {
  if (!recipientId) return
  await prisma.notification.create({
    data: { userId: recipientId, actorId: null, type: 'SYSTEM', refType, refId },
  }).catch(() => {})
  // message 由前端按 refType/refId 展示；留空即通用文案
  void message
}

/** 处理举报：标记状态 + 执行动作 + 通知被举报者（幂等：已处理不可重复动作） */
export async function handleReport(action: ReportAction, reportId: number): Promise<{ ok: boolean; message: string }> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      post: { select: { id: true, authorId: true, title: true } },
    },
  })
  if (!report) throw new Error('举报不存在')
  if (report.status !== 'PENDING') {
    throw new Error('该举报已处理')
  }

  switch (action) {
    case 'DISMISS': {
      await prisma.report.update({ where: { id: reportId }, data: { status: 'DISMISSED' } })
      return { ok: true, message: '已驳回举报' }
    }

    case 'TAKEDOWN_POST': {
      // 帖子下架：TravelPost 隐藏（visibility→PRIVATE 使 Feed 不再展示）
      await prisma.$transaction([
        prisma.travelPost.update({ where: { id: report.postId }, data: { visibility: 'PRIVATE' } }),
        prisma.report.update({ where: { id: reportId }, data: { status: 'ACTIONED' } }),
      ])
      if (report.post.authorId) {
        await systemNotify(report.post.authorId, 'TravelPost', report.postId, '你的旅行圈内容因违规被下架')
      }
      logger.info('moderation', 'report_takedown', { reportId, postId: report.postId, action })
      return { ok: true, message: '已下架该帖子' }
    }

    case 'HIDE_COMMENT': {
      // 隐藏帖子下全部评论（评论区治理：评论状态置 HIDDEN，前端不展示）
      const hidden = await prisma.comment.updateMany({
        where: { postId: report.postId, status: 'VISIBLE' },
        data: { status: 'HIDDEN' },
      })
      await prisma.report.update({ where: { id: reportId }, data: { status: 'ACTIONED' } })
      if (report.post.authorId) {
        await systemNotify(report.post.authorId, 'TravelPost', report.postId, `你的帖子下 ${hidden.count} 条评论因违规被隐藏`)
      }
      return { ok: true, message: `已隐藏 ${hidden.count} 条评论` }
    }

    case 'BAN_USER': {
      // 封禁：屏蔽作者（blockerId=作者 无意义，改为 admin 屏蔽语义：建立 UserBlock 由作者屏蔽举报者无意义；
      // 更合理做法：将帖子下架 + 作者后续发布受限（这里先做下架 + 通知，完整封禁策略在 B3 反垃圾统一处理）
      await prisma.$transaction([
        prisma.travelPost.update({ where: { id: report.postId }, data: { visibility: 'PRIVATE' } }),
        prisma.report.update({ where: { id: reportId }, data: { status: 'ACTIONED' } }),
      ])
      if (report.post.authorId) {
        await systemNotify(report.post.authorId, 'TravelPost', report.postId, '你的内容因严重违规已被下架，请遵守社区规范')
      }
      return { ok: true, message: '已下架帖子并警告作者' }
    }

    default:
      throw new Error('未知处理动作')
  }
}

/** 后台：按状态列出举报（含帖子/作者信息，供处理界面） */
export async function listReportsForAdmin(status?: string, page = 1, pageSize = 20) {
  const where: any = {}
  if (status && ['PENDING', 'REVIEWED', 'DISMISSED', 'ACTIONED'].includes(status)) where.status = status
  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        reporter: { select: { id: true, username: true } },
        post: {
          select: {
            id: true, title: true, visibility: true, publishedAt: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    }),
  ])
  return { data: rows, total, page, pageSize, hasMore: page * pageSize < total }
}
