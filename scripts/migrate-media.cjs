/**
 * Media 2.0 迁移（Phase 4，幂等）：
 * 将旧 PostImage（MySQL LongBlob）导出为本地文件，并建立 Media 记录。
 * 对象存储（S3/MinIO/R2/OSS）可在配置 STORAGE_* 后由应用自动使用，本脚本默认导出到本地 public/uploads/media。
 *
 * 运行：node scripts/migrate-media.cjs
 * 推荐先执行：npx prisma db push
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

  const outDir = path.join(process.cwd(), 'public', 'uploads', 'media');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    console.log('Connected to database:', dbName);
    const [rows] = await connection.query('SELECT id, postId, data, mimeType FROM PostImage ORDER BY id ASC');

    let migrated = 0;
    for (const row of rows) {
      const ext = (row.mimeType || 'image/jpeg').includes('png') ? 'png'
        : (row.mimeType || '').includes('webp') ? 'webp' : 'jpg';
      const storageKey = 'media/' + row.id + '.' + ext;
      const filePath = path.join(outDir, row.id + '.' + ext);

      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, row.data);
      }

      const [existing] = await connection.query('SELECT id FROM Media WHERE storageKey = ?', [storageKey]);
      if (existing.length === 0) {
        await connection.query(
          'INSERT INTO Media (spaceId, type, storageKey, mimeType, size, visibility, createdAt) VALUES (NULL, \'IMAGE\', ?, ?, ?, \'SPACE\', NOW())',
          [storageKey, row.mimeType || 'image/jpeg', Buffer.byteLength(row.data)]
        );
        migrated += 1;
      }
    }

    console.log('Exported', rows.length, 'images; created Media records:', migrated);
    console.log('Media migration completed.');
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error('Media migration failed:', err);
  process.exit(1);
});
