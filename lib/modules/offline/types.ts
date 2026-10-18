/**
 * Offline First 基础类型（Stage 3）。
 * 纯类型定义，不 import 任何 Capacitor/原生模块，保证 Web/SSR 构建安全。
 */

/** 同步状态（用于照片角标：✓ 已同步 / ↑ 待上传 / ☁ 仅云端 / ! 失败 / ⚠ 冲突） */
export type SyncStatus = 'SYNCED' | 'PENDING_UPLOAD' | 'PENDING_DOWNLOAD' | 'ERROR'

/** 同步操作 */
export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'UPLOAD_MEDIA'

/** 实体类型 */
export type EntityType =
  | 'TRAVEL'
  | 'TRAVEL_DAY'
  | 'MEMORY'
  | 'MEDIA'
  | 'ALBUM'
  | 'ALBUM_MEDIA'
  | 'MOMENT'
  | 'SOCIAL_POST'
  | 'COMMENT'
  | 'LIKE'
  | 'FAVORITE'

/**
 * 队列项状态。
 *
 * DEAD = 永久失败，**不再自动重试**（P1-23）。两类来源：
 *   · 服务端明确拒绝（4xx，除 408/429）—— 重试一万次结果也一样；
 *   · 重试次数超过上限（MAX_SYNC_RETRY）。
 * 之前只有 FAILED：任何 4xx 都会被无限重试，队列只增不减，用户永远看到"失败 N 项"。
 * DEAD 项在同步中心单独展示（含服务端错误原文），由用户决定重试或删除。
 */
export type QueueStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'DEAD'

/** 本地记录通用字段 */
export interface LocalRecord {
  remoteId: number | null
  updatedAt: number
  syncStatus: SyncStatus
  deleted: boolean
}

/** 媒体元数据（离线价值核心：只存元数据，不存图片二进制） */
export interface LocalMedia extends LocalRecord {
  id: string
  travelId: number | null
  memoryId: number | null
  type: string // IMAGE | VIDEO | AUDIO
  mimeType: string
  size: number
  width: number | null
  height: number | null
  localPath: string | null // Capacitor 文件路径
  remoteUrl: string | null // 云端 URL
  sha256: string | null
  takenAt: number | null
}

/** 同步队列项 */
export interface SyncQueueItem {
  id: number
  entityType: EntityType
  entityId: string | null // 本地 id，本地新建可为 null
  remoteId: number | null // 云端主键，同步后回填
  operation: SyncOperation
  payload: string // JSON 快照
  retryCount: number
  status: QueueStatus
  lastError: string | null
  createdAt: number
  updatedAt: number
}
