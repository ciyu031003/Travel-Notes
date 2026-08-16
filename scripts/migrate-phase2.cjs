/**
 * Phase 2 数据回填脚本（幂等）：
 * 1. 确保 User / VerificationCode / TimelineItem 表存在
 * 2. 为 Session / SpaceMember / Memory / AuditLog 添加 userId 列
 * 3. 从旧 SiteSetting 回填 User（单管理员迁移）
 * 4. 按 username 回填 userId
 * 5. 从 Travel / Memory 生成 TimelineItem
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function ensureColumn(connection, table, column, ddl) {
  const [rows] = await connection.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  if (rows.length === 0) {
    await connection.query('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + ddl);
    console.log('  + ' + table + '.' + column);
  }
}

async function migrate() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://root:CHANGE_ME@localhost:3306/Travel_And_Study';
  const url = new URL(dbUrl.replace('mysql://', 'http://'));
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: dbName,
    multipleStatements: true,
  });

  try {
    console.log('Connected to database:', dbName);

    await connection.query('CREATE TABLE IF NOT EXISTS `User` (' +
      'id INT NOT NULL AUTO_INCREMENT,' +
      'username VARCHAR(255) NOT NULL,' +
      'passwordHash TEXT NOT NULL,' +
      'email VARCHAR(255) NULL,' +
      'emailVerified BOOLEAN NOT NULL DEFAULT FALSE,' +
      'requirePasswordChange BOOLEAN NOT NULL DEFAULT FALSE,' +
      'anniversaryStart VARCHAR(50) NULL,' +
      'createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      'updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),' +
      'PRIMARY KEY (id),' +
      'UNIQUE KEY User_username_key (username),' +
      'INDEX User_email_idx (email)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    await connection.query('CREATE TABLE IF NOT EXISTS `VerificationCode` (' +
      'id INT NOT NULL AUTO_INCREMENT,' +
      'email VARCHAR(255) NOT NULL,' +
      'purpose VARCHAR(50) NOT NULL,' +
      'codeHash VARCHAR(128) NOT NULL,' +
      'expiresAt DATETIME(3) NOT NULL,' +
      'attempts INT NOT NULL DEFAULT 0,' +
      'consumedAt DATETIME(3) NULL,' +
      'ipHash VARCHAR(128) NULL,' +
      'createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      'PRIMARY KEY (id),' +
      'INDEX VerificationCode_email_purpose_createdAt_idx (email, purpose, createdAt),' +
      'INDEX VerificationCode_purpose_createdAt_idx (purpose, createdAt)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    await connection.query('CREATE TABLE IF NOT EXISTS `TimelineItem` (' +
      'id INT NOT NULL AUTO_INCREMENT,' +
      'spaceId INT NULL,' +
      'type VARCHAR(50) NOT NULL,' +
      'sourceId INT NULL,' +
      'title VARCHAR(255) NOT NULL,' +
      'description TEXT NULL,' +
      'happenedAt DATETIME(3) NOT NULL,' +
      'createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      'PRIMARY KEY (id),' +
      'INDEX TimelineItem_spaceId_happenedAt_idx (spaceId, happenedAt),' +
      'INDEX TimelineItem_type_happenedAt_idx (type, happenedAt)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    await ensureColumn(connection, 'Session', 'userId', 'INT NULL');
    await ensureColumn(connection, 'SpaceMember', 'userId', 'INT NULL');
    await ensureColumn(connection, 'Memory', 'createdById', 'INT NULL');
    await ensureColumn(connection, 'AuditLog', 'userId', 'INT NULL');

    await connection.query('INSERT IGNORE INTO `User` (username, passwordHash, email, emailVerified, requirePasswordChange, anniversaryStart, createdAt, updatedAt) ' +
      'SELECT s.username, s.passwordHash, s.email, s.emailVerified, COALESCE(s.requirePasswordChange, FALSE), s.anniversaryStart, s.createdAt, s.updatedAt ' +
      'FROM `SiteSetting` s WHERE NOT EXISTS (SELECT 1 FROM `User` u LIMIT 1)');
    console.log('Backfilled User from SiteSetting (if empty).');

    await connection.query('UPDATE `Session` s JOIN `User` u ON u.username = s.username SET s.userId = u.id WHERE s.userId IS NULL');
    await connection.query('UPDATE `SpaceMember` sm JOIN `User` u ON u.username = sm.username SET sm.userId = u.id WHERE sm.userId IS NULL');
    await connection.query('UPDATE `Memory` m JOIN `User` u ON u.username = m.createdBy SET m.createdById = u.id WHERE m.createdById IS NULL');
    await connection.query('UPDATE `AuditLog` a JOIN `User` u ON u.username = a.username SET a.userId = u.id WHERE a.userId IS NULL');
    console.log('Backfilled userId on Session / SpaceMember / Memory / AuditLog.');

    await connection.query('INSERT INTO `TimelineItem` (spaceId, type, sourceId, title, description, happenedAt, createdAt) ' +
      'SELECT t.spaceId, \'TRIP\', t.id, t.title, t.description, COALESCE(t.startDate, t.createdAt), NOW() ' +
      'FROM `Travel` t WHERE t.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `TimelineItem` ti WHERE ti.type=\'TRIP\' AND ti.sourceId=t.id)');
    await connection.query('INSERT INTO `TimelineItem` (spaceId, type, sourceId, title, description, happenedAt, createdAt) ' +
      'SELECT m.spaceId, \'MEMORY\', m.id, m.title, m.content, COALESCE(m.happenedAt, m.createdAt), NOW() ' +
      'FROM `Memory` m WHERE m.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `TimelineItem` ti WHERE ti.type=\'MEMORY\' AND ti.sourceId=m.id)');
    console.log('Backfilled TimelineItem from Travel / Memory.');

    console.log('Phase 2 migration completed.');
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error('Phase 2 migration failed:', err);
  process.exit(1);
});
