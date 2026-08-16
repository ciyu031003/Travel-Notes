const mysql = require('mysql2/promise');

function parseDatabaseUrl(raw) {
  const url = new URL(raw.replace('mysql://', 'http://'));
  return {
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

async function main() {
  const raw = process.env.DATABASE_URL || 'mysql://root:root@db:3306/travel_notes';
  const cfg = parseDatabaseUrl(raw);
  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    try {
      const conn = await mysql.createConnection(cfg);
      await conn.ping();
      await conn.end();
      console.log('[wait-for-db] MySQL is ready.');
      return;
    } catch (err) {
      console.log('[wait-for-db] 等待数据库...', err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.error('[wait-for-db] 120 秒内未能连接 MySQL，退出。');
  process.exit(1);
}

main();
