/**
 * Travel 前台数据迁移（Phase 3，幂等）：
 * 将旧 Post(type='travel') 迁移到新 Travel 模型。
 * 字段映射：
 *   Post.title -> Travel.title
 *   Post.slug  -> Travel.slug
 *   Post.summary -> Travel.description
 *   Post.date  -> Travel.startDate / endDate
 *   Post.content -> Travel.content（Markdown 正文）
 *   Post.tags / location / cover -> Travel.tags / location / cover
 *
 * 运行：node scripts/migrate-travels.cjs
 * 推荐先执行：npx prisma db push（以 schema.prisma 为准建表）
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function ensureColumn(connection, table, column, ddl) {
  const [rows] = await connection.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  if (rows.length === 0) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
    console.log(`  + ${table}.${column}`);
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

    await ensureColumn(connection, 'Travel', 'content', 'TEXT NULL');
    await ensureColumn(connection, 'Travel', 'tags', 'TEXT NULL');
    await ensureColumn(connection, 'Travel', 'location', 'VARCHAR(255) NULL');
    await ensureColumn(connection, 'Travel', 'cover', 'VARCHAR(500) NULL');

    const [result] = await connection.query(`
      INSERT INTO \`Travel\` (title, slug, description, startDate, endDate, status, visibility, content, tags, location, cover, createdAt, updatedAt)
      SELECT p.title, p.slug, p.summary, p.date, p.date, 'COMPLETED', 'PUBLIC', p.content, p.tags, p.location, p.cover, p.createdAt, p.updatedAt
      FROM \`Post\` p
      WHERE p.type = 'travel'
        AND NOT EXISTS (SELECT 1 FROM \`Travel\` t WHERE t.slug = p.slug)
    `);
    console.log('Migrated travel posts:', result.affectedRows);
    console.log('Travel frontend migration completed.');
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error('Travel migration failed:', err);
  process.exit(1);
});
