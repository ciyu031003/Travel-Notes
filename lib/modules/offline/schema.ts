/**
 * 本地 SQLite 建表语句（Stage 3.2）。
 * 与云端 Prisma 字段对齐的最小快照集；只存结构化数据，不存图片二进制。
 * 通用列约定：remoteId（云端主键）/ updatedAt（LWW）/ syncStatus / deleted（墓碑）。
 * 社交互动表（comment/like/favorite）按 D-4 决策后置，暂不建表。
 */

export const OFFLINE_SCHEMA_VERSION = 5

export const CREATE_TABLES_SQL: string[] = [
  // 元信息（版本 / 游标）
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)",

  // 同步队列
  "CREATE TABLE IF NOT EXISTS sync_queue (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT, entityType TEXT NOT NULL, entityId TEXT, " +
    "remoteId INTEGER, operation TEXT NOT NULL, payload TEXT NOT NULL, " +
    "retryCount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'PENDING', " +
    "lastError TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)",

  // 旅行
  "CREATE TABLE IF NOT EXISTS travel (" +
    "id TEXT PRIMARY KEY, remoteId INTEGER, title TEXT, slug TEXT, description TEXT, " +
    "location TEXT, cover TEXT, startDate INTEGER, endDate INTEGER, coverMediaId INTEGER, " +
    "status TEXT, visibility TEXT, travelType TEXT, companions TEXT, isPublic INTEGER, " +
    "spaceId INTEGER, ownerId INTEGER, " +
    "updatedAt INTEGER NOT NULL, syncStatus TEXT NOT NULL DEFAULT 'SYNCED', deleted INTEGER NOT NULL DEFAULT 0)",

  // 旅行天
  "CREATE TABLE IF NOT EXISTS travel_day (" +
    "id TEXT PRIMARY KEY, remoteId INTEGER, travelId TEXT, date INTEGER, title TEXT, summary TEXT, " +
    "sortOrder INTEGER, updatedAt INTEGER NOT NULL, " +
    "syncStatus TEXT NOT NULL DEFAULT 'SYNCED', deleted INTEGER NOT NULL DEFAULT 0)",

  // 回忆 / 留言
  "CREATE TABLE IF NOT EXISTS memory (" +
    "id TEXT PRIMARY KEY, remoteId INTEGER, spaceId INTEGER, travelId TEXT, travelDayId TEXT, " +
    "title TEXT, content TEXT, happenedAt INTEGER, mood TEXT, visibility TEXT, " +
    "createdBy TEXT, createdById INTEGER, updatedAt INTEGER NOT NULL, " +
    "syncStatus TEXT NOT NULL DEFAULT 'SYNCED', deleted INTEGER NOT NULL DEFAULT 0)",

  // 媒体元数据
  "CREATE TABLE IF NOT EXISTS media (" +
    "id TEXT PRIMARY KEY, remoteId INTEGER, spaceId INTEGER, memoryId TEXT, travelId TEXT, " +
    "userId INTEGER, type TEXT, mimeType TEXT, size INTEGER, width INTEGER, height INTEGER, " +
    "localPath TEXT, remoteUrl TEXT, sha256 TEXT, takenAt INTEGER, visibility TEXT, isPublic INTEGER, " +
    "updatedAt INTEGER NOT NULL, syncStatus TEXT NOT NULL DEFAULT 'SYNCED', deleted INTEGER NOT NULL DEFAULT 0)",

  // 相册
  "CREATE TABLE IF NOT EXISTS album (" +
    "id TEXT PRIMARY KEY, remoteId INTEGER, spaceId INTEGER, userId INTEGER, title TEXT, " +
    "description TEXT, coverMediaId INTEGER, date INTEGER, locationId INTEGER, travelId INTEGER, visibility TEXT, isPublic INTEGER, " +
    "updatedAt INTEGER NOT NULL, syncStatus TEXT NOT NULL DEFAULT 'SYNCED', deleted INTEGER NOT NULL DEFAULT 0)",

  // 相册-媒体关联
  "CREATE TABLE IF NOT EXISTS album_media (albumId TEXT, mediaId TEXT, sortOrder INTEGER, PRIMARY KEY (albumId, mediaId))",

  // 回忆-媒体多对多关联（v3.1 M2-A2 离线同步：一张照片可进多个回忆）
  "CREATE TABLE IF NOT EXISTS memory_media (" +
    "memoryId TEXT NOT NULL, mediaId TEXT NOT NULL, sortOrder INTEGER NOT NULL DEFAULT 0, " +
    "updatedAt INTEGER NOT NULL, PRIMARY KEY (memoryId, mediaId))",

  // 碎碎念
  "CREATE TABLE IF NOT EXISTS moment (" +
    "id TEXT PRIMARY KEY, remoteId INTEGER, content TEXT, tags TEXT, userId INTEGER, isPublic INTEGER, " +
    "updatedAt INTEGER NOT NULL, syncStatus TEXT NOT NULL DEFAULT 'SYNCED', deleted INTEGER NOT NULL DEFAULT 0)",

  // 旅行圈帖子缓存（D2 社交离线读：Feed/详情离线展示 + 本地互动状态）
  "CREATE TABLE IF NOT EXISTS social_post (" +
    "id TEXT PRIMARY KEY, remoteId INTEGER, title TEXT, summary TEXT, coverUrl TEXT, " +
    "location TEXT, startDate INTEGER, endDate INTEGER, dayCount INTEGER, photoCount INTEGER, " +
    "authorId INTEGER, authorName TEXT, authorNickname TEXT, authorAvatar TEXT, " +
    "likeCount INTEGER NOT NULL DEFAULT 0, commentCount INTEGER NOT NULL DEFAULT 0, favoriteCount INTEGER NOT NULL DEFAULT 0, " +
    "isLiked INTEGER NOT NULL DEFAULT 0, isFavorited INTEGER NOT NULL DEFAULT 0, " +
    "publishedAt INTEGER, updatedAt INTEGER NOT NULL, " +
    "syncStatus TEXT NOT NULL DEFAULT 'SYNCED', deleted INTEGER NOT NULL DEFAULT 0)",
]

export const CREATE_INDEXES_SQL: string[] = [
  "CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_media_sha256 ON media(sha256)",
  "CREATE INDEX IF NOT EXISTS idx_media_syncStatus ON media(syncStatus)",
  "CREATE INDEX IF NOT EXISTS idx_memory_travelId ON memory(travelId)",
  "CREATE INDEX IF NOT EXISTS idx_travel_day_travelId ON travel_day(travelId)",
]
