#!/usr/bin/env node
/**
 * 幂等多用户 schema 增量迁移：
 *  - 检查每个目标列是否存在，不存在才添加（含外键/索引，按 Prisma 约定 ON UPDATE CASCADE）
 *  - 随后回填存量内容归属到第一个用户
 * 用法：node scripts/apply-schema-migration.cjs
 */
const mysql = require('mysql2/promise')
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')

async function getConn() {
  const envPath = path.join(process.cwd(), '.env')
  let databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl && fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?$/m)
    if (match) databaseUrl = match[1]
  }
  if (!databaseUrl) {
    console.error('未找到 DATABASE_URL（请配置 .env 或环境变量）')
    process.exit(1)
  }
  return mysql.createConnection(databaseUrl)
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]
  )
  return rows.length > 0
}

async function addColumn(conn, table, column, ddl) {
  if (await columnExists(conn, table, column)) {
    console.log(`  [skip] ${table}.${column} 已存在`)
    return false
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`)
  console.log(`  [add] ${table}.${column}`)
  return true
}

async function modifyColumn(conn, table, column, ddl) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]
  )
  if (rows.length === 0) {
    console.log(`  [warn] ${table}.${column} 不存在，无法修改`)
    return false
  }
  await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN ${ddl}`)
  console.log(`  [modify] ${table}.${column}`)
  return true
}

async function addFk(conn, table, constraint, ddl) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?',
    [table, constraint]
  )
  if (rows.length > 0) {
    console.log(`  [skip] FK ${constraint} 已存在`)
    return false
  }
  try {
    await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` ${ddl}`)
    console.log(`  [add] FK ${constraint}`)
    return true
  } catch (e) {
    console.log(`  [warn] FK ${constraint} 添加失败: ${e.message}`)
    return false
  }
}

async function addIndex(conn, table, indexName, ddl) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
    [table, indexName]
  )
  if (rows.length > 0) {
    console.log(`  [skip] INDEX ${indexName} 已存在`)
    return false
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` ${ddl}`)
  console.log(`  [add] INDEX ${indexName}`)
  return true
}

async function addUniqueIndex(conn, table, indexName, columns) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?',
    [table, indexName]
  )
  if (rows.length > 0) {
    console.log(`  [skip] UNIQUE ${indexName} 已存在`)
    return false
  }
  try {
    await conn.query(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (${columns})`)
    console.log(`  [add] UNIQUE ${indexName}`)
    return true
  } catch (e) {
    console.log(`  [warn] UNIQUE ${indexName} 添加失败: ${e.message}`)
    return false
  }
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [table]
  )
  return rows.length > 0
}

async function createTable(conn, table, ddl) {
  if (await tableExists(conn, table)) {
    console.log('  [skip] 表 ' + table + ' 已存在')
    return false
  }
  await conn.query(ddl)
  console.log('  [create] 表 ' + table)
  return true
}

async function main() {
  const conn = await getConn()
  console.log('== 1/2 增量 schema 迁移 ==')

  // 多元场景：Visibility.COUPLE → SPACE（幂等数据迁移，供 db push 枚举变更前清理旧值）
  // 涉及表：Travel / Memory / Media / Album / TravelPost 等含 visibility 的表
  const visibilityTables = ['Travel', 'Memory', 'Media', 'Album', 'TravelPost', 'TimelineItem', 'Moment', 'PhotoMessage', 'Anniversary']
  for (const t of visibilityTables) {
    try {
      const [res] = await conn.query(`UPDATE \`${t}\` SET visibility = 'SPACE' WHERE visibility = 'COUPLE'`)
      if (res.affectedRows > 0) console.log(`  [visibility] ${t}: COUPLE→SPACE ${res.affectedRows} 行`)
    } catch (e) {
      // 表不存在或列不存在时跳过（幂等）
      console.log(`  [visibility] ${t} 跳过（${e.code || e.message}）`)
    }
  }

  // User（个人主页：昵称/头像/8 位账号 ID）
  await addColumn(conn, 'User', 'nickname', 'nickname VARCHAR(50) NULL AFTER anniversaryStart')
  await addColumn(conn, 'User', 'avatarUrl', 'avatarUrl VARCHAR(500) NULL AFTER nickname')
  await addColumn(conn, 'User', 'accountId', 'accountId VARCHAR(12) NULL AFTER avatarUrl')
  await addColumn(conn, 'User', 'bio', 'bio VARCHAR(200) NULL AFTER accountId')
  await addUniqueIndex(conn, 'User', 'User_accountId_key', 'accountId')

  // Post
  await addColumn(conn, 'Post', 'userId', 'userId INT NULL AFTER published')
  await addColumn(conn, 'Post', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER userId")
  await addFk(conn, 'Post', 'Post_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')

  // Travel
  await addColumn(conn, 'Travel', 'ownerId', 'ownerId INT NULL AFTER spaceId')
  await addColumn(conn, 'Travel', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER visibility")
  // 多元场景：旅行类型 + 同行者
  await addColumn(conn, 'Travel', 'travelType', "travelType ENUM('ALONE','COUPLE','FAMILY','FRIENDS','BFF','GROUP','OTHER') NOT NULL DEFAULT 'ALONE' AFTER isPublic")
  await addColumn(conn, 'Travel', 'companions', 'companions JSON NULL AFTER travelType')
  await addFk(conn, 'Travel', 'Travel_ownerId_fkey', 'FOREIGN KEY (ownerId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')

  // Album
  await addColumn(conn, 'Album', 'userId', 'userId INT NULL AFTER spaceId')
  await addColumn(conn, 'Album', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER visibility")
  await addFk(conn, 'Album', 'Album_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')
  // v3.1 M1-A1：相册绑定旅行（一个相册 = 一次旅行/一座城市）
  await addColumn(conn, 'Album', 'travelId', 'travelId INT NULL AFTER locationId')
  await addFk(conn, 'Album', 'Album_travelId_fkey', 'FOREIGN KEY (travelId) REFERENCES Travel(id) ON DELETE SET NULL ON UPDATE CASCADE')
  await addIndex(conn, 'Album', 'Album_travelId_idx', '(travelId)')

  // Media
  await addColumn(conn, 'Media', 'userId', 'userId INT NULL AFTER memoryId')
  await addColumn(conn, 'Media', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER visibility")
  await addFk(conn, 'Media', 'Media_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')

  // Moment
  await addColumn(conn, 'Moment', 'userId', 'userId INT NULL AFTER tags')
  await addColumn(conn, 'Moment', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER userId")
  await addFk(conn, 'Moment', 'Moment_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')
  await addIndex(conn, 'Moment', 'Moment_userId_idx', '(userId)')

  // PhotoMessage
  await addColumn(conn, 'PhotoMessage', 'userId', 'userId INT NULL AFTER content')
  await addColumn(conn, 'PhotoMessage', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER userId")
  await addFk(conn, 'PhotoMessage', 'PhotoMessage_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')
  await addIndex(conn, 'PhotoMessage', 'PhotoMessage_userId_idx', '(userId)')

  // Anniversary
  await addColumn(conn, 'Anniversary', 'userId', 'userId INT NULL AFTER id')
  await addColumn(conn, 'Anniversary', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER coverMediaId")
  await addFk(conn, 'Anniversary', 'Anniversary_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')
  await addIndex(conn, 'Anniversary', 'Anniversary_userId_idx', '(userId)')

  // TimelineItem
  await addColumn(conn, 'TimelineItem', 'userId', 'userId INT NULL AFTER spaceId')
  await addFk(conn, 'TimelineItem', 'TimelineItem_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')

  console.log('== 1.5/2 社交域建表（Stage 2）==')
  const socialTables = [
    {
      name: 'TravelPost',
      sql: `CREATE TABLE IF NOT EXISTS TravelPost (
        id INT NOT NULL AUTO_INCREMENT,
        travelId INT NULL,
        postId INT NULL,
        authorId INT NOT NULL,
        visibility ENUM('PRIVATE','SPACE','PUBLIC') NOT NULL DEFAULT 'PUBLIC',
        title VARCHAR(255) NOT NULL,
        summary TEXT NULL,
        coverMediaId INT NULL,
        publishedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        likeCount INT NOT NULL DEFAULT 0,
        commentCount INT NOT NULL DEFAULT 0,
        favoriteCount INT NOT NULL DEFAULT 0,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY TravelPost_travelId_key (travelId),
        UNIQUE KEY TravelPost_postId_key (postId),
        KEY TravelPost_authorId_publishedAt_idx (authorId, publishedAt),
        KEY TravelPost_publishedAt_idx (publishedAt),
        CONSTRAINT TravelPost_travelId_fkey FOREIGN KEY (travelId) REFERENCES Travel(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT TravelPost_postId_fkey FOREIGN KEY (postId) REFERENCES Post(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT TravelPost_authorId_fkey FOREIGN KEY (authorId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'PostLike',
      sql: `CREATE TABLE IF NOT EXISTS PostLike (
        id INT NOT NULL AUTO_INCREMENT,
        postId INT NOT NULL,
        userId INT NOT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY PostLike_postId_userId_key (postId, userId),
        KEY PostLike_userId_createdAt_idx (userId, createdAt),
        CONSTRAINT PostLike_postId_fkey FOREIGN KEY (postId) REFERENCES TravelPost(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT PostLike_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'PostFavorite',
      sql: `CREATE TABLE IF NOT EXISTS PostFavorite (
        id INT NOT NULL AUTO_INCREMENT,
        postId INT NOT NULL,
        userId INT NOT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY PostFavorite_postId_userId_key (postId, userId),
        KEY PostFavorite_userId_createdAt_idx (userId, createdAt),
        CONSTRAINT PostFavorite_postId_fkey FOREIGN KEY (postId) REFERENCES TravelPost(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT PostFavorite_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'Comment',
      sql: `CREATE TABLE IF NOT EXISTS Comment (
        id INT NOT NULL AUTO_INCREMENT,
        postId INT NOT NULL,
        userId INT NOT NULL,
        parentId INT NULL,
        content TEXT NOT NULL,
        status ENUM('VISIBLE','HIDDEN','DELETED','PENDING') NOT NULL DEFAULT 'VISIBLE',
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY Comment_postId_status_createdAt_idx (postId, status, createdAt),
        KEY Comment_userId_createdAt_idx (userId, createdAt),
        KEY Comment_parentId_idx (parentId),
        CONSTRAINT Comment_postId_fkey FOREIGN KEY (postId) REFERENCES TravelPost(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT Comment_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT Comment_parentId_fkey FOREIGN KEY (parentId) REFERENCES Comment(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'CommentLike',
      sql: `CREATE TABLE IF NOT EXISTS CommentLike (
        id INT NOT NULL AUTO_INCREMENT,
        commentId INT NOT NULL,
        userId INT NOT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY CommentLike_commentId_userId_key (commentId, userId),
        CONSTRAINT CommentLike_commentId_fkey FOREIGN KEY (commentId) REFERENCES Comment(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT CommentLike_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'UserFollow',
      sql: `CREATE TABLE IF NOT EXISTS UserFollow (
        id INT NOT NULL AUTO_INCREMENT,
        followerId INT NOT NULL,
        followingId INT NOT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY UserFollow_followerId_followingId_key (followerId, followingId),
        KEY UserFollow_followingId_createdAt_idx (followingId, createdAt),
        CONSTRAINT UserFollow_followerId_fkey FOREIGN KEY (followerId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT UserFollow_followingId_fkey FOREIGN KEY (followingId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'Notification',
      sql: `CREATE TABLE IF NOT EXISTS Notification (
        id INT NOT NULL AUTO_INCREMENT,
        userId INT NOT NULL,
        actorId INT NULL,
        type ENUM('LIKE','COMMENT','REPLY','FAVORITE','FOLLOW') NOT NULL,
        refType VARCHAR(50) NOT NULL,
        refId INT NOT NULL,
        isRead TINYINT(1) NOT NULL DEFAULT 0,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY Notification_userId_isRead_createdAt_idx (userId, isRead, createdAt),
        KEY Notification_actorId_idx (actorId),
        CONSTRAINT Notification_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT Notification_actorId_fkey FOREIGN KEY (actorId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'Report',
      sql: `CREATE TABLE IF NOT EXISTS Report (
        id INT NOT NULL AUTO_INCREMENT,
        postId INT NOT NULL,
        reporterId INT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        status ENUM('PENDING','REVIEWED','DISMISSED','ACTIONED') NOT NULL DEFAULT 'PENDING',
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY Report_postId_reporterId_key (postId, reporterId),
        KEY Report_status_createdAt_idx (status, createdAt),
        KEY Report_reporterId_idx (reporterId),
        CONSTRAINT Report_postId_fkey FOREIGN KEY (postId) REFERENCES TravelPost(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT Report_reporterId_fkey FOREIGN KEY (reporterId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'UserBlock',
      sql: `CREATE TABLE IF NOT EXISTS UserBlock (
        id INT NOT NULL AUTO_INCREMENT,
        blockerId INT NOT NULL,
        blockedId INT NOT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY UserBlock_blockerId_blockedId_key (blockerId, blockedId),
        KEY UserBlock_blockedId_idx (blockedId),
        CONSTRAINT UserBlock_blockerId_fkey FOREIGN KEY (blockerId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT UserBlock_blockedId_fkey FOREIGN KEY (blockedId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ]
  for (const def of socialTables) {
    await createTable(conn, def.name, def.sql)
  }

  // v3.1 M2-A2：回忆-媒体 多对多关联表（一图多回忆）
  await createTable(conn, 'MemoryMedia', `CREATE TABLE IF NOT EXISTS MemoryMedia (
    id INT NOT NULL AUTO_INCREMENT,
    memoryId INT NOT NULL,
    mediaId INT NOT NULL,
    sortOrder INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY MemoryMedia_memoryId_mediaId_key (memoryId, mediaId),
    KEY MemoryMedia_mediaId_idx (mediaId),
    CONSTRAINT MemoryMedia_memoryId_fkey FOREIGN KEY (memoryId) REFERENCES Memory(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT MemoryMedia_mediaId_fkey FOREIGN KEY (mediaId) REFERENCES Media(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  // MemoryMedia 回填：存量 Media.memoryId 主关联 → 关联表（幂等，不覆盖已存在）
  await conn.query(
    `INSERT IGNORE INTO MemoryMedia (memoryId, mediaId, sortOrder)
     SELECT memoryId, id, 0 FROM Media WHERE memoryId IS NOT NULL`
  ).catch(() => {})

  // TravelPost：支持 Travel 或 Post 两种来源（表已存在后修改）
  await modifyColumn(conn, 'TravelPost', 'travelId', 'travelId INT NULL')
  await addColumn(conn, 'TravelPost', 'postId', 'postId INT NULL AFTER travelId')
  await addUniqueIndex(conn, 'TravelPost', 'TravelPost_postId_key', 'postId')
  await addFk(conn, 'TravelPost', 'TravelPost_postId_fkey', 'FOREIGN KEY (postId) REFERENCES Post(id) ON DELETE CASCADE ON UPDATE CASCADE')

  // 账号 ID 回填（admin 固定 01230821；纪念日用户 = 2 位随机前缀 + YYYYMMDD；其余随机 8 位）
  async function backfillUserAccountIds() {
    const [allUsers] = await conn.query('SELECT id, username, anniversaryStart, accountId FROM User')
    const used = new Set((allUsers || []).filter((u) => u.accountId).map((u) => String(u.accountId)))
    for (const u of allUsers || []) {
      if (u.accountId) continue
      let accountId = ''
      if (u.username === 'admin') {
        accountId = '01230821'
      } else {
        const date = String(u.anniversaryStart || '').replace(/\D/g, '')
        for (let attempt = 0; attempt < 100; attempt++) {
          if (date.length === 8) {
            const prefix = String(crypto.randomInt(0, 100)).padStart(2, '0')
            accountId = prefix + date
          } else {
            accountId = String(crypto.randomInt(10000000, 100000000))
          }
          if (!used.has(accountId)) break
        }
      }
      used.add(accountId)
      await conn.query('UPDATE User SET accountId = ? WHERE id = ?', [accountId, u.id])
      console.log(`  [accountId] #${u.id} ${u.username} -> ${accountId}`)
    }
  }
  await backfillUserAccountIds()

  // 存量公开文章回填到旅行圈（Post -> TravelPost，postId 唯一幂等）
  try {
    const [userCheck] = await conn.query('SELECT id FROM User ORDER BY id ASC LIMIT 1')
    if (userCheck.length > 0) {
      const fallbackUserId = userCheck[0].id
      const [res] = await conn.query(
        `INSERT INTO TravelPost (postId, authorId, visibility, title, summary, publishedAt, createdAt, updatedAt)
         SELECT p.id, COALESCE(p.userId, ?), 'PUBLIC', p.title, p.summary, p.date, NOW(3), NOW(3)
         FROM Post p
         WHERE p.type = 'travel' AND p.published = 1 AND p.isPublic = 1
         ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), publishedAt = VALUES(publishedAt)`,
        [fallbackUserId]
      )
      console.log(`  [publicPosts] 回填公开文章 ${res.affectedRows} 行`)
    } else {
      console.log('  [publicPosts] 用户表为空，跳过公开文章回填')
    }
  } catch (e) {
    console.log('  [publicPosts] 回填跳过（' + (e.code || e.message) + '）')
  }

  console.log('== 2/2 归属回填 ==')
  const [users] = await conn.query('SELECT id, username FROM User ORDER BY id ASC LIMIT 1')
  if (users.length === 0) {
    console.log('用户表为空，跳过回填（请先创建管理员账号）')
  } else {
    const admin = users[0]
    console.log(`归属目标用户: #${admin.id} ${admin.username}`)
    const tables = [
      ['Post', 'userId'],
      ['Travel', 'ownerId'],
      ['Album', 'userId'],
      ['Media', 'userId'],
      ['Moment', 'userId'],
      ['PhotoMessage', 'userId'],
      ['Anniversary', 'userId'],
      ['TimelineItem', 'userId'],
    ]
    for (const [table, col] of tables) {
      try {
        const [res] = await conn.query(
          `UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` IS NULL`,
          [admin.id]
        )
        console.log(`  ${table}.${col} 回填 ${res.affectedRows} 行`)
      } catch (e) {
        console.log(`  ${table}.${col} 跳过（${e.code || e.message}）`)
      }
    }
  }

  await conn.end()
  console.log('完成 ✅')
}

main().catch((e) => {
  console.error('迁移失败:', e.message || e)
  process.exit(1)
})
