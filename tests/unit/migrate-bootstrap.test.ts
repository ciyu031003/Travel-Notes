import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

/**
 * B：存量 db-push 库升级自动修复（scripts/migrate-bootstrap.cjs）
 *
 * 本文件只测**纯函数**与 CLI 的快速失败路径；真实 MySQL 集成在
 * tests/unit/migrate-bootstrap.integration.test.ts（需 TN_BOOTSTRAP_IT_DATABASE_URL 才运行）。
 */
const requireCjs = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bootstrap: any = requireCjs('../../scripts/migrate-bootstrap.cjs')

describe('splitSqlStatements', () => {
  it('去掉行注释、按分号切分、保留语句内容', () => {
    const sql = [
      '-- CreateTable',
      'CREATE TABLE `A` (id INT);',
      '',
      '# CreateIndex',
      'CREATE INDEX `A_id_idx` ON `A`(`id`);',
    ].join('\n')
    const statements = bootstrap.splitSqlStatements(sql)
    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain('CREATE TABLE')
    expect(statements[1]).toContain('CREATE INDEX')
  })

  it('引号内的分号不会被误切（DEFAULT 值里带分号）', () => {
    const sql = "ALTER TABLE `A` ADD COLUMN `x` VARCHAR(10) DEFAULT 'a;b'; CREATE TABLE `B` (id INT)"
    const statements = bootstrap.splitSqlStatements(sql)
    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain("DEFAULT 'a;b'")
  })

  it('空脚本返回空数组', () => {
    expect(bootstrap.splitSqlStatements('  \n-- nothing\n')).toEqual([])
  })
})

describe('filterAdditiveSql：只保留加法 DDL', () => {
  it('接受 CREATE TABLE / CREATE INDEX / CREATE UNIQUE INDEX / ALTER TABLE ADD COLUMN', () => {
    const sql = [
      'CREATE TABLE `ClientMutation` (id VARCHAR(128) NOT NULL, PRIMARY KEY (id));',
      'CREATE INDEX `Moment_updatedAt_idx` ON `Moment`(`updatedAt`);',
      'CREATE UNIQUE INDEX `U_email_key` ON `U`(`email`);',
      'ALTER TABLE `User` ADD COLUMN `siteRole` VARCHAR(20) NOT NULL DEFAULT \'USER\';',
    ].join('\n')
    const result = bootstrap.filterAdditiveSql(sql)
    expect(result.rejected).toEqual([])
    expect(result.statements).toHaveLength(4)
  })

  it('拒绝 DROP / RENAME / MODIFY / CHANGE / TRUNCATE / 数据语句（绝不自动删数据）', () => {
    const sql = [
      'DROP TABLE `Old`;',
      'DROP INDEX `Old_idx` ON `T`;',
      'ALTER TABLE `T` DROP COLUMN `legacy`;',
      'ALTER TABLE `T` MODIFY COLUMN `a` TEXT;',
      'ALTER TABLE `T` CHANGE COLUMN `a` `b` TEXT;',
      'ALTER TABLE `T` RENAME TO `T2`;',
      'TRUNCATE TABLE `T`;',
      'UPDATE `T` SET a = 1;',
      'INSERT INTO `T` (a) VALUES (1);',
    ].join('\n')
    const result = bootstrap.filterAdditiveSql(sql)
    expect(result.statements).toEqual([])
    expect(result.rejected).toHaveLength(9)
  })

  it('混合脚本：加法被保留、破坏性被单列上报', () => {
    const sql = [
      'ALTER TABLE `Album` ADD COLUMN `travelId` INT NULL;',
      'CREATE INDEX `Album_travelId_idx` ON `Album`(`travelId`);',
      'DROP TABLE `ClientMutation`;',
    ].join('\n')
    const result = bootstrap.filterAdditiveSql(sql)
    expect(result.statements).toHaveLength(2)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]).toContain('DROP TABLE')
  })
})

describe('evaluateObjects：P1 对象探测状态', () => {
  const objects = bootstrap.P1_OBJECTS

  it('全部不存在 → none（走正常 deploy，行为不变）', () => {
    const result = bootstrap.evaluateObjects(objects, {})
    expect(result.state).toBe('none')
    expect(result.present).toEqual([])
    expect(result.missing).toHaveLength(objects.length)
  })

  it('部分存在（典型：历史 db push 已建 Album_travelId_idx）→ partial', () => {
    const existsMap = { [bootstrap.objectKey({ kind: 'index', table: 'Album', name: 'Album_travelId_idx' })]: true }
    const result = bootstrap.evaluateObjects(objects, existsMap)
    expect(result.state).toBe('partial')
    expect(result.present.map((o: any) => o.label)).toEqual(['Album_travelId_idx'])
    expect(result.missing).toHaveLength(objects.length - 1)
  })

  it('7 个对象全部存在 → all（P3018 现场）', () => {
    const existsMap: Record<string, boolean> = {}
    for (const object of objects) existsMap[bootstrap.objectKey(object)] = true
    const result = bootstrap.evaluateObjects(objects, existsMap)
    expect(result.state).toBe('all')
    expect(result.present).toHaveLength(7)
    expect(result.missing).toEqual([])
  })
})

describe('detectP1Objects：对象探测查询（fake conn）', () => {
  function fakeConn(presentKeys: string[]) {
    return {
      query: async (sql: string, params: unknown[]) => {
        const [, table, name] = params as [string, string, string]
        const kind = sql.includes('information_schema.columns') ? 'column' : 'index'
        const key = `${kind}:${table}:${name}`
        return [presentKeys.includes(key) ? [{ '1': 1 }] : [], []]
      },
    }
  }

  it('列与索引分别查 information_schema，返回存在性 map', async () => {
    const map = await bootstrap.detectP1Objects(
      fakeConn(['column:User:siteRole', 'index:Album:Album_travelId_idx']),
      'travel_notes',
    )
    expect(map['column:User:siteRole']).toBe(true)
    expect(map['index:Album:Album_travelId_idx']).toBe(true)
    expect(map['index:User:User_siteRole_idx']).toBe(false)
    expect(Object.keys(map)).toHaveLength(7)
  })
})

describe('hasDataStatements：含数据回填的迁移不自动 resolve', () => {
  it('INSERT/UPDATE/DELETE 命中；纯 DDL 不命中', () => {
    expect(bootstrap.hasDataStatements('UPDATE `Travel` SET confirmedAt = createdAt;')).toBe(true)
    expect(bootstrap.hasDataStatements('INSERT INTO `X` (a) VALUES (1);')).toBe(true)
    expect(bootstrap.hasDataStatements('DELETE FROM `X` WHERE a = 1;')).toBe(true)
    expect(bootstrap.hasDataStatements('ALTER TABLE `User` ADD COLUMN `siteRole` VARCHAR(20);')).toBe(false)
    expect(bootstrap.hasDataStatements('CREATE INDEX `i` ON `T`(`x`);')).toBe(false)
  })
})

describe('迁移目录读取', () => {
  it('listMigrationNames 返回按目录名排序的迁移（含基线/P1/B4）', () => {
    const names = bootstrap.listMigrationNames()
    expect(names).toContain('20261018000000_init')
    expect(names).toContain('20261018120000_p1_indexes_and_site_role')
    expect(names).toEqual([...names].sort())
  })

  it('readMigrationSql 读到基线 SQL；不存在返回 null', () => {
    const initSql = bootstrap.readMigrationSql('20261018000000_init')
    expect(typeof initSql).toBe('string')
    expect(initSql).toContain('CREATE TABLE')
    expect(bootstrap.readMigrationSql('99999999999999_does_not_exist')).toBeNull()
  })

  it('P1 迁移对象与 schema 探测列表一致（7 个）', () => {
    expect(bootstrap.P1_OBJECTS).toHaveLength(7)
    expect(bootstrap.P1_OBJECTS[0]).toMatchObject({ kind: 'column', table: 'User', name: 'siteRole' })
    expect(bootstrap.P1_OBJECTS[6]).toMatchObject({ kind: 'index', table: 'Album', name: 'Album_travelId_idx' })
  })
})

describe('parseDatabaseUrl', () => {
  it('解析 host/port/user/password/database（含 URL 编码密码）', () => {
    const cfg = bootstrap.parseDatabaseUrl('mysql://root:p%40ss@127.0.0.1:13307/tn_it')
    expect(cfg).toEqual({ host: '127.0.0.1', port: 13307, user: 'root', password: 'p@ss', database: 'tn_it' })
  })
})

describe('CLI 快速失败路径（缺 DATABASE_URL）', () => {
  it('exit 1 并打印手工恢复指引与文档路径', () => {
    const env = { ...process.env }
    delete env.DATABASE_URL
    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', 'migrate-bootstrap.cjs')], {
      encoding: 'utf8',
      env,
      timeout: 15_000,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL')
    expect(result.stderr).toContain('docs/DEPLOYMENT.md')
  })
})
