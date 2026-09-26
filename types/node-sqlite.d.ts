/**
 * `node:sqlite` 的最小类型声明。
 *
 * 为什么需要：Node 24 内置了 `node:sqlite`（实验特性），但当前 `@types/node`
 * 版本里还没有对应的 .d.ts，直接用会 TS2307。
 * 我们在离线层测试里用它跑**真实 SQLite**（见 tests/unit/offline-real-sqlite.test.ts），
 * 而 `node:sqlite` 的 `all()` 返回「按列名索引的对象」——与 Android 插件
 * （CapacitorSQLite.Database.selectSQL 的 `row.put(colName, v)`）语义一致，
 * 因此是验证真机行为的有效手段。
 *
 * 这里只声明用到的最小面，避免为了一个测试引入额外依赖。
 */
declare module 'node:sqlite' {
  export interface StatementSync {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  }

  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
