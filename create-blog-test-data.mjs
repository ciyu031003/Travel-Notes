import mysql from 'mysql2/promise'

async function main() {
  console.log('开始创建技术博客测试数据...')

  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Abd123456.',
    database: 'Travel_And_Study',
  })

  console.log('数据库连接成功')

  const blogPosts = [
    {
      slug: 'nextjs-deploy-guide',
      title: 'Next.js 项目部署到阿里云 ECS 完整指南',
      content: '# Next.js 项目部署到阿里云 ECS\n\n## 环境准备\n- ECS 实例（Ubuntu 22.04）\n- Node.js 18+\n- Nginx\n\n## 步骤\n\n### 1. 安装 Node.js\n```bash\ncurl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -\nsudo apt-get install -y nodejs\n```\n\n### 2. 构建项目\n```bash\nnpm run build\n```\n\n### 3. 使用 PM2 部署\n```bash\nnpm install -g pm2\npm2 start npm --name nextjs-app -- start\n```\n\n### 4. 配置 Nginx\n配置反向代理到 3000 端口。',
      date: '2026-07-25',
      cover: null,
      tags: JSON.stringify(['Next.js', '部署', '阿里云', 'Nginx']),
      location: null,
      type: 'blog',
      summary: '详细介绍如何将 Next.js 项目部署到阿里云 ECS，包括环境准备、构建、PM2 配置和 Nginx 反向代理',
      published: 1,
    },
    {
      slug: 'react-hooks-deep-dive',
      title: 'React Hooks 深入理解：useEffect 与 useLayoutEffect',
      content: '# React Hooks 深入理解\n\n## useEffect\n在浏览器完成绘制后异步执行，适用于数据请求等。\n\n## useLayoutEffect\n在 DOM 更新后、浏览器绘制前同步执行，适用于需要读取 DOM 尺寸等场景。\n\n## 对比总结\n- useEffect：异步，不会阻塞浏览器绘制\n- useLayoutEffect：同步，会阻塞浏览器绘制\n\n选择原则：优先使用 useEffect，除非确实需要同步执行。',
      date: '2026-07-20',
      cover: null,
      tags: JSON.stringify(['React', 'Hooks', '前端']),
      location: null,
      type: 'blog',
      summary: '深入理解 React Hooks 中 useEffect 和 useLayoutEffect 的区别及使用场景',
      published: 1,
    },
    {
      slug: 'typescript-generics',
      title: 'TypeScript 泛型实战：打造类型安全的工具库',
      content: '# TypeScript 泛型实战\n\n## 基础泛型\n```typescript\nfunction identity<T>(arg: T): T {\n  return arg;\n}\n```\n\n## 约束泛型\n```typescript\ninterface Lengthwise {\n  length: number;\n}\n\nfunction loggingIdentity<T extends Lengthwise>(arg: T): T {\n  console.log(arg.length);\n  return arg;\n}\n```\n\n## 实际应用\n构建类型安全的 API 调用层，确保请求和响应类型匹配。',
      date: '2026-07-15',
      cover: null,
      tags: JSON.stringify(['TypeScript', '前端', '类型系统']),
      location: null,
      type: 'blog',
      summary: '通过实战案例学习 TypeScript 泛型的使用，构建类型安全的工具库',
      published: 1,
    },
    {
      slug: 'docker-multistage-build',
      title: 'Docker 多阶段构建优化 Node.js 镜像',
      content: '# Docker 多阶段构建\n\n## 问题\n传统 Dockerfile 会把所有依赖都打包到镜像中，导致镜像体积过大。\n\n## 解决方案\n使用多阶段构建，将构建阶段和运行阶段分离。\n\n```dockerfile\n# 构建阶段\nFROM node:18 AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\n# 运行阶段\nFROM node:18-alpine\nWORKDIR /app\nCOPY --from=builder /app/dist ./dist\nCOPY --from=builder /app/node_modules ./node_modules\nCMD [\"npm\", \"start\"]\n```\n\n## 效果\n镜像体积从 1GB+ 减小到 200MB 左右。',
      date: '2026-07-10',
      cover: null,
      tags: JSON.stringify(['Docker', 'Node.js', '运维', '性能优化']),
      location: null,
      type: 'blog',
      summary: '使用 Docker 多阶段构建优化 Node.js 应用镜像，大幅减小镜像体积',
      published: 1,
    },
    {
      slug: 'mysql-index-optimization',
      title: 'MySQL 索引优化：从原理到实战',
      content: '# MySQL 索引优化\n\n## B+ 树索引\n- 适合范围查询和排序\n- 索引存储在磁盘上\n\n## 优化原则\n1. 最左前缀原则\n2. 覆盖索引\n3. 避免索引失效\n\n## 注意事项\n- 不要在小表上建索引\n- 定期分析索引使用情况\n- 删除无用索引',
      date: '2026-07-05',
      cover: null,
      tags: JSON.stringify(['MySQL', '数据库', '性能优化', '后端']),
      location: null,
      type: 'blog',
      summary: '深入理解 MySQL 索引原理，掌握索引优化的实战技巧',
      published: 1,
    },
    {
      slug: 'css-grid-layout',
      title: 'CSS Grid 布局完全指南：响应式设计实战',
      content: '# CSS Grid 布局\n\n## 基础概念\n- Grid Container：网格容器\n- Grid Item：网格项\n- Grid Line：网格线\n- Grid Track：网格轨道\n\n## 常用属性\n```css\n.container {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 20px;\n}\n\n.item {\n  grid-column: span 2;\n}\n```\n\n## 响应式设计\n使用 auto-fit 和 minmax 实现自适应布局。\n\n## 实际案例\n实现电商商品列表、后台管理系统布局等。',
      date: '2026-07-01',
      cover: null,
      tags: JSON.stringify(['CSS', '前端', '布局']),
      location: null,
      type: 'blog',
      summary: '完整的 CSS Grid 布局指南，包含响应式设计的实战案例',
      published: 1,
    },
  ]

  for (const post of blogPosts) {
    const [rows] = await connection.execute(
      'SELECT id FROM Post WHERE slug = ?',
      [post.slug]
    )

    if (rows.length > 0) {
      console.log(`更新文章: ${post.title}`)
      await connection.execute(
        `UPDATE Post SET title=?, content=?, date=?, tags=?, type=?, summary=?, published=1 WHERE slug=?`,
        [post.title, post.content, post.date, post.tags, post.type, post.summary, post.slug]
      )
    } else {
      console.log(`创建文章: ${post.title}`)
      await connection.execute(
        `INSERT INTO Post (slug, title, content, date, cover, tags, location, type, summary, published, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [post.slug, post.title, post.content, post.date, post.cover, post.tags, post.location, post.type, post.summary]
      )
    }
  }

  const [posts] = await connection.execute(
    'SELECT id, title, tags FROM Post WHERE type = ? ORDER BY date DESC',
    ['blog']
  )

  console.log(`\n当前共有 ${posts.length} 篇技术博客文章:`)
  posts.forEach((post, index) => {
    console.log(`  ${index + 1}. ${post.title}`)
  })

  await connection.end()
  console.log('\n完成！')
}

main().catch((error) => {
  console.error('错误:', error)
  process.exit(1)
})
