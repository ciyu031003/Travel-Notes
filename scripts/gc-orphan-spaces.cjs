#!/usr/bin/env node
/**
 * 孤儿空间治理（P0 数据卫生，**默认 dry-run**）。
 *
 * 背景：本机真库 34 个空间里有 30 个「无任何成员」的孤儿（见《我的空间模块优化方案》§1.3）。
 * 成因是 `ensurePersonalSpace` 为每个用户自动建 SOLO 空间，用户（多为 e2e 临时账号）
 * 被删除后成员行随之消失，而 **Space 本身还在**。
 *
 * 为什么必须专门清理：`SpaceService.deleteSpace` 要求调用者是空间成员 ——
 * 孤儿空间没有任何成员，因此**任何入口都删不掉它们**，只能靠脚本。
 *
 * 安全原则：**只删「无成员 且 无任何内容引用」的空间**。只要空间下还挂着
 * Travel / Album / Memory / Media，就打印出来交人工判断 —— 绝不连带删内容。
 * （注意：`Travel`/`Album`/`Memory` 的外键是 onDelete: Cascade，
 *   一旦误删空间就会连带删掉这些内容，所以本脚本刻意保守。）
 *
 * 用法：
 *   node scripts/gc-orphan-spaces.cjs            # dry-run（默认，只报告）
 *   node scripts/gc-orphan-spaces.cjs --apply    # 真正删除空孤儿空间
 */
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const APPLY = process.argv.includes('--apply')

function readEnvUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    const m = raw.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)
    if (m) return m[1]
  } catch {
    // 忽略：下面统一报错
  }
  throw new Error('未找到 DATABASE_URL（环境变量与 .env 都没有）')
}

;(async () => {
  const url = new URL(readEnvUrl())
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    charset: 'utf8mb4',
  })

  console.log(`\n[gc-orphan-spaces] 模式：${APPLY ? 'APPLY（会删库）' : 'DRY-RUN（只报告）'}`)

  // 无任何 SpaceMember 行的空间
  const [orphans] = await conn.query(
    `SELECT s.id, s.name, s.slug, s.spaceType, s.createdAt
       FROM \`Space\` s
      WHERE NOT EXISTS (SELECT 1 FROM \`SpaceMember\` m WHERE m.spaceId = s.id)
      ORDER BY s.id`,
  )

  console.log(`无成员的空间：${orphans.length}\n`)
  if (orphans.length === 0) {
    console.log('✅ 没有孤儿空间。\n')
    await conn.end()
    return
  }

  const empty = []
  const withContent = []

  for (const s of orphans) {
    const [[counts]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM \`Travel\`  WHERE spaceId = ?) AS travels,
         (SELECT COUNT(*) FROM \`Album\`   WHERE spaceId = ?) AS albums,
         (SELECT COUNT(*) FROM \`Memory\`  WHERE spaceId = ?) AS memories,
         (SELECT COUNT(*) FROM \`Media\`   WHERE spaceId = ?) AS media`,
      [s.id, s.id, s.id, s.id],
    )
    const total = Number(counts.travels) + Number(counts.albums) + Number(counts.memories) + Number(counts.media)
    if (total === 0) {
      empty.push(s)
      console.log(`  · 空孤儿 #${s.id} ${s.name} /${s.slug} (${s.spaceType})`)
    } else {
      withContent.push({ ...s, counts })
      console.log(
        `  ⚠️  有内容的孤儿 #${s.id} ${s.name} /${s.slug} — ` +
          `旅行 ${counts.travels} / 相册 ${counts.albums} / 回忆 ${counts.memories} / 媒体 ${counts.media}（跳过，需人工判断）`,
      )
    }
  }

  console.log(`\n可安全删除（无成员 + 无内容）：${empty.length} 个`)
  console.log(`需人工判断（有内容）：${withContent.length} 个`)

  if (APPLY) {
    let deleted = 0
    for (const s of empty) {
      await conn.query('DELETE FROM `Space` WHERE id = ?', [s.id])
      deleted++
    }
    console.log(`\n✔ 已删除 ${deleted} 个空孤儿空间`)
  } else if (empty.length) {
    console.log('\n加 --apply 才会真正删除。删除前建议先备份：见 docs/DEPLOYMENT.md\n')
  } else {
    console.log('')
  }

  if (withContent.length) {
    console.log('有内容的孤儿请逐个人工处理（例如把内容迁到一个有效空间，或确认后手工删除）：')
    for (const r of withContent) console.log(`  - Space#${r.id} ${r.name} /${r.slug}  ${JSON.stringify(r.counts)}`)
    console.log('')
  }

  await conn.end()
})().catch((e) => {
  console.error('[gc-orphan-spaces] 失败：', e.message)
  process.exitCode = 1
})
