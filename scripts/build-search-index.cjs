/**
 * 静态全文搜索索引生成脚本
 * ============================================================
 * 背景：本项目部署在 2C2G 服务器，构建时以 SKIP_DB_ON_BUILD=1 跳过数据库读取，
 *       因此构建期 HTML 为轻量壳，Pagefind 等基于构建产物的索引无法工作。
 * 方案：构建完成后运行本脚本，直连数据库 + 读取 content/ 下的 Markdown 文章，
 *       生成 public/search-index.json 静态索引；前端在 /search 页与命令面板
 *       本地即时搜索，索引不可用时自动回退到 /api/search。
 *
 * 用法：
 *   node scripts/build-search-index.cjs
 *   DATABASE_URL=mysql://... node scripts/build-search-index.cjs
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config();

const APP_DIR = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(APP_DIR, 'content');

function stripMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/[*_~>|]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readMarkdownPosts(directory, moduleName) {
  const dir = path.join(CONTENT_DIR, directory);
  if (!fs.existsSync(dir)) return [];
  const posts = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    let raw = fs.readFileSync(path.join(dir, file), 'utf8');
    // 去除 UTF-8 BOM，避免 frontmatter 正则失配
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let data = {};
    if (fmMatch) {
      for (const line of fmMatch[1].split(/\r?\n/)) {
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        let value = m[2].trim();
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value
            .slice(1, -1)
            .split(',')
            .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        }
        data[key] = value;
      }
    }
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    posts.push({
      id: 0,
      slug,
      module: moduleName,
      title: data.title || slug,
      date: data.date || new Date().toISOString(),
      description: data.description || '',
      tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
      content: stripMarkdown(body),
    });
  }
  return posts;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[search-index] 缺少 DATABASE_URL，跳过数据库文章（仅索引 Markdown）');
  }

  const posts = [];

  // 1. 数据库文章（数据库不可用时优雅降级，仅索引 Markdown）
  if (dbUrl) {
    let connection;
    try {
      const url = new URL(dbUrl.replace('mysql://', 'http://'));
      const dbName = decodeURIComponent(url.pathname.slice(1));
      connection = await mysql.createConnection({
        host: url.hostname,
        port: parseInt(url.port || '3306', 10),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: dbName,
        connectTimeout: 5000,
      });

      const [rows] = await connection.query(
        `SELECT id, slug, title, date, summary, tags, content, type, location
         FROM Post
         WHERE published = 1 AND type IN ('blog', 'mindmap')
         ORDER BY date DESC`
      );
      for (const row of rows) {
        let tags = [];
        try { tags = row.tags ? JSON.parse(row.tags) : []; } catch { tags = row.tags ? String(row.tags).split(',').map(t => t.trim()).filter(Boolean) : []; }
        posts.push({
          id: row.id,
          slug: row.slug,
          module: row.type === 'mindmap' ? 'mindmap' : 'blog',
          title: row.title || row.slug,
          date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
          description: row.summary || '',
          tags,
          location: row.location || '',
          content: stripMarkdown(row.content || '').slice(0, 3000),
        });
      }
      console.log(`[search-index] 数据库文章: ${rows.length} 篇`);
    } catch (e) {
      console.error('[search-index] 读取数据库失败:', e.message);
    } finally {
      if (connection) await connection.end();
    }
  }

  // 2. Markdown 文章（与 getPostsHybrid 保持一致）
  const mdPosts = [
    ...readMarkdownPosts('tech/blog', 'blog'),
    ...readMarkdownPosts('tech/mindmaps', 'mindmap'),
  ];
  const dbSlugs = new Set(posts.map((p) => `${p.module}:${p.slug}`));
  for (const mp of mdPosts) {
    if (!dbSlugs.has(`${mp.module}:${mp.slug}`)) {
      posts.push(mp);
    }
  }
  console.log(`[search-index] Markdown 文章: ${mdPosts.length} 篇（新增 ${posts.length - (posts.length - mdPosts.filter(mp => !dbSlugs.has(`${mp.module}:${mp.slug}`)).length)} 篇）`);

  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const index = {
    generatedAt: new Date().toISOString(),
    version: 1,
    posts,
  };

  const outDir = path.join(APP_DIR, 'public');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'search-index.json'), JSON.stringify(index), 'utf8');
  console.log(`[search-index] 索引已生成: public/search-index.json (${posts.length} 篇, ${(JSON.stringify(index).length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error('[search-index] 生成失败:', e);
  process.exit(1);
});




