import { createPool, Pool, PoolConnection, ResultSetHeader, FieldPacket } from 'mysql2/promise'

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

const DB_CONFIG = {
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '25'),
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '50'),
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000'),
  timeout: parseInt(process.env.DB_TIMEOUT || '10000'),
  reconnectInterval: parseInt(process.env.DB_RECONNECT_INTERVAL || '30000'),
  retryMaxAttempts: parseInt(process.env.DB_RETRY_MAX_ATTEMPTS || '5'),
  retryInitialDelay: parseInt(process.env.DB_RETRY_INITIAL_DELAY || '1000'),
  healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '60000'),
}

export class PrismaMariaDB {
  readonly provider = 'mysql' as const
  readonly adapterName = '@prisma/adapter-mariadb' as const
  private pool: Pool | null = null
  private connecting: Promise<PrismaAdapter> | null = null
  private url: string
  private healthCheckTimer: NodeJS.Timeout | null = null
  private isShuttingDown = false

  constructor(options: { url: string } | { connectionString: string }) {
    this.url = 'url' in options ? options.url : options.connectionString
    this.setupGracefulShutdown()
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      if (this.isShuttingDown) return
      this.isShuttingDown = true
      console.log('[PrismaMariaDB] Received shutdown signal, closing pool...')
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer)
        this.healthCheckTimer = null
      }
      if (this.pool) {
        try {
          await this.pool.end()
          console.log('[PrismaMariaDB] Pool closed successfully')
        } catch (err) {
          console.error('[PrismaMariaDB] Error closing pool:', err)
        }
      }
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }

  async connect(): Promise<PrismaAdapter> {
    if (this.pool && this.pool.getConnection) {
      try {
        const conn = await this.pool.getConnection()
        await conn.ping()
        conn.release()
        return createAdapter(this.pool, this.getDatabaseName())
      } catch {
        await this.reconnect()
      }
    }
    if (this.connecting) {
      return this.connecting
    }
    this.connecting = this._connectWithRetry()
    return this.connecting
  }

  private getDatabaseName(): string {
    const url = new URL(this.url)
    return decodeURIComponent(url.pathname.slice(1))
  }

  private async _connectWithRetry(attempt: number = 0): Promise<PrismaAdapter> {
    try {
      return await this._connect()
    } catch (error: any) {
      attempt++
      if (attempt >= DB_CONFIG.retryMaxAttempts) {
        console.error(`[PrismaMariaDB] Max connection attempts (${DB_CONFIG.retryMaxAttempts}) reached`)
        throw new Error(`Failed to connect to database after ${DB_CONFIG.retryMaxAttempts} attempts: ${error.message}`)
      }
      const delay = DB_CONFIG.retryInitialDelay * Math.pow(2, attempt - 1)
      console.warn(`[PrismaMariaDB] Connection attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return this._connectWithRetry(attempt)
    }
  }

  private async _connect(): Promise<PrismaAdapter> {
    const url = new URL(this.url)
    const config = {
      host: url.hostname || 'localhost',
      port: parseInt(url.port || '3306'),
      user: decodeURIComponent(url.username || 'root'),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      charset: 'utf8mb4',
      // Json 列以文本字符串返回，由 Prisma 引擎统一解析：
      // 直接返回解析后对象会让引擎在 select-back 时 String(obj) → "[object Object]" 再 JSON.parse 失败（companions 写/读全崩）
      jsonStrings: true,
      waitForConnections: true,
      connectionLimit: DB_CONFIG.connectionLimit,
      queueLimit: DB_CONFIG.queueLimit,
      dateStrings: false,
      connectTimeout: DB_CONFIG.timeout,
      namedPlaceholders: true,
    }
    console.log(`[PrismaMariaDB] Connecting to MySQL: ${config.host}:${config.port}/${config.database}`)
    console.log(`[PrismaMariaDB] Pool config: limit=${DB_CONFIG.connectionLimit}, queue=${DB_CONFIG.queueLimit}`)

    this.pool = createPool(config)

    this.pool.on('enqueue', () => {
      console.warn('[PrismaMariaDB] Connection enqueued, pool may be exhausted')
    })

    try {
      const conn = await this.pool.getConnection()
      await conn.ping()
      conn.release()
      console.log('[PrismaMariaDB] Connected successfully')

      this.startHealthCheck()

      return createAdapter(this.pool, config.database)
    } catch (error: any) {
      console.error('[PrismaMariaDB] Connection failed:', error.message)
      if (this.pool) {
        await this.pool.end().catch(() => {})
        this.pool = null
      }
      throw error
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    this.healthCheckTimer = setInterval(async () => {
      if (!this.pool || this.isShuttingDown) return
      try {
        const conn = await this.pool.getConnection()
        await conn.ping()
        conn.release()
      } catch (err: any) {
        console.warn('[PrismaMariaDB] Health check failed:', err.message)
        await this.reconnect()
      }
    }, DB_CONFIG.healthCheckInterval)

    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref()
    }
  }

  private async reconnect(): Promise<void> {
    if (this.isShuttingDown) return
    console.warn('[PrismaMariaDB] Attempting reconnection...')

    if (this.pool) {
      try {
        await this.pool.end()
      } catch {
      }
      this.pool = null
    }

    try {
      const url = new URL(this.url)
    const config = {
      host: url.hostname || 'localhost',
      port: parseInt(url.port || '3306'),
      user: decodeURIComponent(url.username || 'root'),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      // 显式 utf8mb4：确保 emoji/生僻字不被连接级字符集截断为 '?'
      charset: 'utf8mb4',
      // 与 _connect 保持一致：Json 列返回字符串，由 Prisma 引擎解析（见 _connect 注释）
      jsonStrings: true,
      waitForConnections: true,
      connectionLimit: DB_CONFIG.connectionLimit,
      queueLimit: DB_CONFIG.queueLimit,
      dateStrings: false,
      connectTimeout: DB_CONFIG.timeout,
      namedPlaceholders: true,
    }

      this.pool = createPool(config)
      const conn = await this.pool.getConnection()
      await conn.ping()
      conn.release()
      console.log('[PrismaMariaDB] Reconnected successfully')
    } catch (err: any) {
      console.error('[PrismaMariaDB] Reconnection failed:', err.message)
    }
  }

  getPoolStatus(): {
    totalConnections: number
    activeConnections: number
    idleConnections: number
    waitingRequests: number
  } | null {
    if (!this.pool) return null
    try {
      const pool = this.pool as any
      return {
        totalConnections: pool.totalConnections ?? 0,
        activeConnections: pool.activeConnections ?? 0,
        idleConnections: pool.idleConnections ?? 0,
        waitingRequests: pool.pendingConnections ?? 0,
      }
    } catch {
      return null
    }
  }

  async dispose(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }
}

function mysqlDateFormat(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  const milliseconds = pad(date.getMilliseconds(), 3)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
}

function convertArgToMySQLFormat(arg: unknown): unknown {
  if (arg instanceof Date) {
    return mysqlDateFormat(arg)
  }
  if (typeof arg === 'string') {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/
    if (isoDateRegex.test(arg)) {
      const date = new Date(arg)
      if (!isNaN(date.getTime())) {
        return mysqlDateFormat(date)
      }
    }
  }
  return arg
}

function processArgs(args: Array<unknown>): Array<unknown> {
  return args.map(convertArgToMySQLFormat)
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
    const processedArgs = processArgs(params.args)
    const [rows, fields] = await pool.execute(params.sql, processedArgs as any)
    return processRows(rows, fields)
  }

  async function executeRaw(params: SqlQuery): Promise<number> {
    const processedArgs = processArgs(params.args)
    const [result] = await pool.execute(params.sql, processedArgs as any)
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
    const processedArgs = processArgs(params.args)
    const [rows, fields] = await conn.execute(params.sql, processedArgs as any)
    return processRows(rows, fields)
  }

  async function executeRaw(params: SqlQuery): Promise<number> {
    const processedArgs = processArgs(params.args)
    const [result] = await conn.execute(params.sql, processedArgs as any)
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
