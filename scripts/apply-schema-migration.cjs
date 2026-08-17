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
