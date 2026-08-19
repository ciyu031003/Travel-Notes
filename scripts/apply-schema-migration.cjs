#!/usr/bin/env node
/**
 * 幂等多用户 schema 增量迁移：
 *  - 检查每个目标列是否存在，不存在才添加（含外键/索引，按 Prisma 约定 ON UPDATE CASCADE）
 *  - 随后回填存量内容归属到第一个用户
 * 用法：node scripts/apply-schema-migration.cjs
 */
const mysql = require('mysql2/promise')
const fs = require('fs')
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

  // Post
  await addColumn(conn, 'Post', 'userId', 'userId INT NULL AFTER published')
  await addColumn(conn, 'Post', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER userId")
  await addFk(conn, 'Post', 'Post_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')

  // Travel
  await addColumn(conn, 'Travel', 'ownerId', 'ownerId INT NULL AFTER spaceId')
  await addColumn(conn, 'Travel', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER visibility")
  await addFk(conn, 'Travel', 'Travel_ownerId_fkey', 'FOREIGN KEY (ownerId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')

  // Album
  await addColumn(conn, 'Album', 'userId', 'userId INT NULL AFTER spaceId')
  await addColumn(conn, 'Album', 'isPublic', "isPublic TINYINT(1) NOT NULL DEFAULT 0 AFTER visibility")
  await addFk(conn, 'Album', 'Album_userId_fkey', 'FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE')

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
        travelId INT NOT NULL,
        authorId INT NOT NULL,
        visibility ENUM('PRIVATE','COUPLE','PUBLIC') NOT NULL DEFAULT 'PUBLIC',
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
        KEY TravelPost_authorId_publishedAt_idx (authorId, publishedAt),
        KEY TravelPost_publishedAt_idx (publishedAt),
        CONSTRAINT TravelPost_travelId_fkey FOREIGN KEY (travelId) REFERENCES Travel(id) ON DELETE CASCADE ON UPDATE CASCADE,
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
  ]
  for (const def of socialTables) {
    await createTable(conn, def.name, def.sql)
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
