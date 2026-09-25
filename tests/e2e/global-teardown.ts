import mysql from 'mysql2/promise'
import fs from 'node:fs'
import path from 'node:path'

/**
 * E2E 全局 teardown：清理 e2e_runner 的测试数据（先子表后主表）+ 删除账号 + storageState。
 * 只动 e2e_runner 名下数据，不碰其他账号。
 */
export default async function globalTeardown() {
  // Playwright 不会加载 .env，这里直接读文件（仅本地测试用）
  let url = process.env.DATABASE_URL || ''
  if (!url) {
    try {
      const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8')
      url = envFile.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1] || ''
    } catch {}
  }
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/)
  if (!m) throw new Error('[e2e-teardown] DATABASE_URL 无法解析')
  const [, user, password, host, port, database] = m

  const conn = await mysql.createConnection({ host, port: Number(port || 3306), user, password, database })
  const run = async (sql: string, params: any[] = []) => {
    try { await conn.execute(sql, params) } catch (e) { console.warn('[e2e-teardown] skip:', (e as Error).message) }
  }
  // 偏好问卷用例按时间戳建号（e2e_survey_*）——按前缀清理，避免残留
  const [surveyRows] = await conn.execute("SELECT id FROM User WHERE username LIKE 'e2e_survey_%'")
  for (const row of surveyRows as { id: number }[]) {
    await run('DELETE FROM Session WHERE userId = ?', [row.id])
    await run('DELETE FROM SpaceMember WHERE userId = ?', [row.id])
    await run('UPDATE Travel SET ownerId = NULL WHERE ownerId = ?', [row.id])
    await run('DELETE FROM User WHERE id = ?', [row.id])
  }

  const uidSql = 'SELECT id FROM User WHERE username = ?'
  const [rows] = await conn.execute(uidSql, ['e2e_runner'])
  const uid = (rows as { id: number }[])[0]?.id
  if (uid) {
    // e2e_runner 名下：碎碎念 / 旅行（无照片/天数子数据，仍防御性清理子表）
    await run('DELETE FROM Moment WHERE userId = ?', [uid])
    await run('DELETE FROM Session WHERE userId = ?', [uid])
    await run('DELETE FROM TimelineItem WHERE userId = ?', [uid])
    await run('DELETE FROM Travel WHERE ownerId = ?', [uid])
    await run('DELETE FROM SpaceMember WHERE userId = ?', [uid])
    await run('DELETE FROM User WHERE id = ?', [uid])
  }
  await conn.end()

  // 刻意**保留** tests/e2e/.auth/state.json：
  // globalSetup 每次运行都会重新登录并覆写它，而删除它会让「不使用 globalSetup 的场景」
  // （例如只跑单个 spec 且沿用已有 storageState）在 newContext 阶段直接失败。
  // 该目录已在 .gitignore（tests/e2e/.auth/），保留不产生仓库污染。
}
