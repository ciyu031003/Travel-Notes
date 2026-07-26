import { createPool, Pool, PoolConnection, RowDataPacket, ResultSetHeader, FieldPacket } from 'mysql2/promise'

const ColumnTypeEnum = {
  Int32: 0,
  Int64: 1,
  Float: 2,
  Double: 3,
  Numeric: 4,
  Boolean: 5,
  Character: 6,
  Text: 7,
  Date: 8,
  Time: 9,
  DateTime: 10,
  Json: 11,
  Enum: 12,
  Bytes: 13,
  Set: 14,
  Uuid: 15,
}

const BINARY_FLAG = 0x80

type ArgScalarType = 'string' | 'int' | 'bigint' | 'float' | 'decimal' | 'boolean' | 'enum' | 'uuid' | 'json' | 'datetime' | 'bytes' | 'unknown'

type ArgType = {
  scalarType: ArgScalarType
  dbType?: string
  arity: 'required' | 'optional' | 'list' | 'tuple'
}

type SqlQuery = {
  sql: string
  args: Array<unknown>
  argTypes: Array<ArgType>
}

type SqlResultSet = {
  columnTypes: Array<number>
  columnNames: Array<string>
  rows: Array<Array<unknown>>
  lastInsertId?: string
}

type IsolationLevel = 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SNAPSHOT' | 'SERIALIZABLE'

type ConnectionInfo = {
  schemaName?: string
  maxBindValues?: number
  supportsRelationJoins: boolean
}

type TransactionOptions = {
  usePhantomQuery: boolean
}

interface PrismaAdapter {
  readonly provider: 'mysql'
  readonly adapterName: '@prisma/adapter-mariadb'
  queryRaw(params: SqlQuery): Promise<SqlResultSet>
  executeRaw(params: SqlQuery): Promise<number>
  executeScript(script: string): Promise<void>
  startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction>
  getConnectionInfo?(): ConnectionInfo
  dispose(): Promise<void>
}

interface Transaction extends PrismaAdapter {
  readonly options: TransactionOptions
  commit(): Promise<void>
  rollback(): Promise<void>
  createSavepoint?(name: string): Promise<void>
  rollbackToSavepoint?(name: string): Promise<void>
  releaseSavepoint?(name: string): Promise<void>
}

function mapColumnType(mysqlType: number, flags?: number, columnLength?: number): number {
  switch (mysqlType) {
    case 0: return ColumnTypeEnum.Numeric
    case 1: return (columnLength === 1) ? ColumnTypeEnum.Boolean : ColumnTypeEnum.Int32
    case 2: return ColumnTypeEnum.Int32
    case 3: return ColumnTypeEnum.Int32
    case 4: return ColumnTypeEnum.Float
    case 5: return ColumnTypeEnum.Double
    case 6: return ColumnTypeEnum.Text
    case 7: return ColumnTypeEnum.DateTime
    case 8: return ColumnTypeEnum.Int64
    case 9: return ColumnTypeEnum.Int32
    case 10: return ColumnTypeEnum.Date
    case 11: return ColumnTypeEnum.Time
    case 12: return ColumnTypeEnum.DateTime
    case 13: return ColumnTypeEnum.Int32
    case 15: return ColumnTypeEnum.Text
    case 16: return ColumnTypeEnum.Boolean
    case 245: return ColumnTypeEnum.Json
    case 246: return ColumnTypeEnum.Numeric
    case 247: return ColumnTypeEnum.Enum
    case 248: return ColumnTypeEnum.Set
    case 249: return (flags !== undefined && (flags & BINARY_FLAG)) ? ColumnTypeEnum.Bytes : ColumnTypeEnum.Text
    case 250: return (flags !== undefined && (flags & BINARY_FLAG)) ? ColumnTypeEnum.Bytes : ColumnTypeEnum.Text
    case 251: return (flags !== undefined && (flags & BINARY_FLAG)) ? ColumnTypeEnum.Bytes : ColumnTypeEnum.Text
    case 252: return (flags !== undefined && (flags & BINARY_FLAG)) ? ColumnTypeEnum.Bytes : ColumnTypeEnum.Text
    case 253: return ColumnTypeEnum.Text
    case 254: return ColumnTypeEnum.Text
    case 255: return ColumnTypeEnum.Text
    default: return ColumnTypeEnum.Text
  }
}

export class PrismaMariaDB {
  readonly provider = 'mysql' as const
  readonly adapterName = '@prisma/adapter-mariadb' as const
  private pool: Pool | null = null
  private connecting: Promise<PrismaAdapter> | null = null
  private url: string

  constructor(options: { url: string } | { connectionString: string }) {
    this.url = 'url' in options ? options.url : options.connectionString
  }

  async connect(): Promise<PrismaAdapter> {
    if (this.pool) {
      return createAdapter(this.pool, this.getDatabaseName())
    }
    if (this.connecting) {
      return this.connecting
    }
    this.connecting = this._connect()
    return this.connecting
  }

  private getDatabaseName(): string {
    const url = new URL(this.url)
    return decodeURIComponent(url.pathname.slice(1))
  }

  private async _connect(): Promise<PrismaAdapter> {
    const url = new URL(this.url)
    const config = {
      host: url.hostname || 'localhost',
      port: parseInt(url.port || '3306'),
      user: decodeURIComponent(url.username || 'root'),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: false,
    }
    console.log('[PrismaMariaDB] Connecting to MySQL:', `${config.host}:${config.port}/${config.database}`)
    this.pool = createPool(config)
    try {
      const conn = await this.pool.getConnection()
      await conn.ping()
      conn.release()
      console.log('[PrismaMariaDB] Connected successfully')
    } catch (error: any) {
      console.error('[PrismaMariaDB] Connection failed:', error.message)
      throw error
    }
    return createAdapter(this.pool, config.database)
  }
}

function processRows(rows: any, fields: FieldPacket[] | undefined): SqlResultSet {
  const columnNames: string[] = fields ? fields.map((f: any) => f.name) : []
  const columnTypes: number[] = fields ? fields.map((f: any) => mapColumnType(f.type, f.flags, f.length)) : []

  const isSelectRows = Array.isArray(rows)
  const dataRows: Array<Array<unknown>> = isSelectRows
    ? rows.map((row: any) => {
        return columnNames.map((col: string) => {
          const val = row[col]
          if (val === null || val === undefined) return null
          if (Buffer.isBuffer(val)) return val
          if (val instanceof Date) return val
          if (typeof val === 'bigint') return val.toString()
          return val
        })
      })
    : []

  let lastInsertId: string | undefined
  if (!isSelectRows && rows && typeof rows === 'object') {
    const rsh = rows as ResultSetHeader
    if (rsh.insertId !== undefined && rsh.insertId !== null) {
      lastInsertId = String(rsh.insertId)
    }
  }

  return { columnTypes, columnNames, rows: dataRows, lastInsertId }
}

function createAdapter(pool: Pool, databaseName: string): PrismaAdapter {
  const provider = 'mysql' as const
  const adapterName = '@prisma/adapter-mariadb' as const

  async function queryRaw(params: SqlQuery): Promise<SqlResultSet> {
    const [rows, fields] = await pool.execute(params.sql, params.args as any)
    return processRows(rows, fields)
  }

  async function executeRaw(params: SqlQuery): Promise<number> {
    const [result] = await pool.execute(params.sql, params.args as any)
    if (Array.isArray(result)) {
      return result.length
    }
    return (result as ResultSetHeader).affectedRows ?? 0
  }

  async function executeScript(script: string): Promise<void> {
    const statements = script.split(';').filter(s => s.trim())
    for (const stmt of statements) {
      await pool.execute(stmt)
    }
  }

  async function startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    const conn = await pool.getConnection()
    if (isolationLevel) {
      const levelMap: Record<string, string> = {
        'READ UNCOMMITTED': 'READ UNCOMMITTED',
        'READ COMMITTED': 'READ COMMITTED',
        'REPEATABLE READ': 'REPEATABLE READ',
        'SNAPSHOT': 'SERIALIZABLE',
        'SERIALIZABLE': 'SERIALIZABLE',
      }
      const level = levelMap[isolationLevel] || isolationLevel
      await conn.execute(`SET TRANSACTION ISOLATION LEVEL ${level}`)
    }
    await conn.beginTransaction()
    return createTransaction(conn, databaseName)
  }

  function getConnectionInfo(): ConnectionInfo {
    return { schemaName: databaseName, supportsRelationJoins: true }
  }

  async function dispose(): Promise<void> {
    await pool.end()
  }

  return {
    provider,
    adapterName,
    queryRaw,
    executeRaw,
    executeScript,
    startTransaction,
    getConnectionInfo,
    dispose,
  }
}

function createTransaction(conn: PoolConnection, databaseName: string): Transaction {
  const provider = 'mysql' as const
  const adapterName = '@prisma/adapter-mariadb' as const

  async function queryRaw(params: SqlQuery): Promise<SqlResultSet> {
    const [rows, fields] = await conn.execute(params.sql, params.args as any)
    return processRows(rows, fields)
  }

  async function executeRaw(params: SqlQuery): Promise<number> {
    const [result] = await conn.execute(params.sql, params.args as any)
    if (Array.isArray(result)) {
      return result.length
    }
    return (result as ResultSetHeader).affectedRows ?? 0
  }

  async function executeScript(script: string): Promise<void> {
    const statements = script.split(';').filter(s => s.trim())
    for (const stmt of statements) {
      await conn.execute(stmt)
    }
  }

  async function commit(): Promise<void> {
    await conn.commit()
    conn.release()
  }

  async function rollback(): Promise<void> {
    await conn.rollback()
    conn.release()
  }

  async function createSavepoint(name: string): Promise<void> {
    await conn.execute(`SAVEPOINT ${name}`)
  }

  async function rollbackToSavepoint(name: string): Promise<void> {
    await conn.execute(`ROLLBACK TO SAVEPOINT ${name}`)
  }

  async function releaseSavepoint(name: string): Promise<void> {
    await conn.execute(`RELEASE SAVEPOINT ${name}`)
  }

  return {
    provider,
    adapterName,
    queryRaw,
    executeRaw,
    executeScript,
    startTransaction: async () => { throw new Error('Nested transactions not supported') },
    getConnectionInfo: () => ({ schemaName: databaseName, supportsRelationJoins: true }),
    dispose: async () => { conn.release() },
    options: { usePhantomQuery: false },
    commit,
    rollback,
    createSavepoint,
    rollbackToSavepoint,
    releaseSavepoint,
  }
}
