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

  const stateFile = path.join(__dirname, '.auth', 'state.json')
  if (fs.existsSync(stateFile)) fs.rmSync(stateFile)
}
