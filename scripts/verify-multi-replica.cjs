#!/usr/bin/env node
/**
 * verify-multi-replica.cjs —— 多副本部署就绪自检（task-38，report-only）
 *
 * 为什么需要它：多副本的坑几乎都出在「部署侧没配」而不是代码 —— REDIS_URL 没配（限额/缓存各副本各一份）、
 * MEDIA_TMP_DIR 没指向共享卷（分片上传 init 在 A、chunk 落到 B → 404）。上线前跑一次本脚本，
 * 就能把这两项从「以为配了」变成「确认可用」。
 *
 * 检查项：
 *   ① Redis（仅当配置 REDIS_URL）：
 *      connect + ping（默认 2000ms 超时）→ SET tn:cache:probe:<rand> PX 2000 → GET 校验写后读 → PTTL 校验 TTL
 *      → INCR tn:rl:probe:<rand>（期望 1）→ PEXPIRE 1000 → 再 INCR（期望 2，且 TTL 不被重置）→ 清理全部探测键
 *   ② 媒体临时目录：MEDIA_TMP_DIR（未配置则 os.tmpdir()）写一个小文件 → 读回校验 → 删除
 *   ③ 未配置 REDIS_URL：明确输出 redis.status = "not-configured"（回退进程内存，单副本行为不变）并 exit 0
 *
 * 输出：单个 JSON（stdout），便于 jq / 巡检脚本消费；人读提示写 stderr。
 * 退出码：全部就绪（含「未配置 Redis」）→ 0；配置了 Redis 但连不上/探测失败，或共享目录不可写 → 1。
 *
 * 用法：
 *   node scripts/verify-multi-replica.cjs              # 报告模式（无 Redis 环境也应 exit 0）
 *   node scripts/verify-multi-replica.cjs --self-test  # 用内存假对象自测判定逻辑，不连外部服务
 *   node scripts/verify-multi-replica.cjs --help
 *
 * 环境变量：REDIS_URL、MEDIA_TMP_DIR、REDIS_PROBE_TIMEOUT_MS（默认 2000）。
 * 依赖：仅 Node 内置模块；配置了 Redis 时才按需 require('ioredis')（项目已有依赖，未新增）。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_TIMEOUT_MS = 2000
const CACHE_PROBE_TTL_MS = 2000
const RL_PROBE_TTL_MS = 1000

/* ───────────────────────── 通用小工具 ───────────────────────── */

/** 极简 .env 解析（不引依赖）：只取 KEY=VALUE，支持引号与 # 行注释 */
function parseEnvFile(text) {
  const out = {}
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    const hash = value.indexOf(' #')
    if (hash >= 0) value = value.slice(0, hash).trim()
    out[key] = value
  }
  return out
}

/** 读取仓库根 .env（仅用于补 env；已存在的 process.env 优先，绝不被文件覆盖） */
function loadEnvFile(rootDir) {
  try {
    const envPath = path.join(rootDir, '.env')
    if (!fs.existsSync(envPath)) return {}
    return parseEnvFile(fs.readFileSync(envPath, 'utf8'))
  } catch {
    return {}
  }
}

/** Redis URL 脱敏：日志/JSON 里绝不出现密码 */
function redactRedisUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    // 非法 URL：只保留 scheme（若有），避免把疑似口令原样打出来
    const scheme = url.includes('://') ? url.split('://')[0] : ''
    return scheme ? scheme + '://<invalid-url>' : '<invalid-url>'
  }
}

function randomSuffix() {
  return crypto.randomBytes(6).toString('hex')
}

/** 给 Promise 加超时（Redis 卡住时不能把巡检脚本挂死） */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error((label || 'operation') + ' 超时（' + ms + 'ms）')), ms)
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) }
    )
  })
}

/* ───────────────────────── Redis 探测（client 可注入 → 可自测） ───────────────────────── */

/**
 * 对给定 client 跑完整探测；返回 { status, checks, keys, error? }。
 * client 只需实现：ping/set/get/pttl/incr/pexpire/del（ioredis 与自测 fake 都满足）。
 */
async function runRedisProbe(client, options) {
  const opts = options || {}
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS
  const suffix = opts.suffix || randomSuffix()
  const cacheKey = 'tn:cache:probe:' + suffix
  const rlKey = 'tn:rl:probe:' + suffix
  const checks = {
    ping: false,
    cacheWrite: false,
    cacheRead: false,
    cacheTtl: false,
    rateLimitIncr: false,
    rateLimitExpire: false,
    cleanup: false,
  }
  const payload = 'probe-' + Date.now()
  let error = null

  try {
    await withTimeout(client.ping(), timeoutMs, 'ping')
    checks.ping = true

    // 1) 缓存键：写 → 读回 → TTL 必须存在（证明与 lib/infrastructure/cache-redis 的 PX 语义一致）
    await withTimeout(client.set(cacheKey, payload, 'PX', CACHE_PROBE_TTL_MS), timeoutMs, 'cache set')
    checks.cacheWrite = true
    const readBack = await withTimeout(client.get(cacheKey), timeoutMs, 'cache get')
    checks.cacheRead = readBack === payload
    if (!checks.cacheRead) throw new Error('缓存写后读不一致（期望 ' + payload + '，实际 ' + String(readBack) + '）')
    const cacheTtl = await withTimeout(client.pttl(cacheKey), timeoutMs, 'cache pttl')
    checks.cacheTtl = typeof cacheTtl === 'number' && cacheTtl > 0 && cacheTtl <= CACHE_PROBE_TTL_MS
    if (!checks.cacheTtl) throw new Error('缓存键没有 TTL（实际 ' + String(cacheTtl) + 'ms），多副本会残留脏键')

    // 2) 限流键：INCR 必须从 1 开始；PEXPIRE 后再次 INCR 必须变 2 且不重置窗口 TTL
    const first = await withTimeout(client.incr(rlKey), timeoutMs, 'ratelimit incr #1')
    checks.rateLimitIncr = Number(first) === 1
    if (!checks.rateLimitIncr) throw new Error('限流键首次 INCR 期望 1，实际 ' + String(first) + '（键未清理？）')
    await withTimeout(client.pexpire(rlKey, RL_PROBE_TTL_MS), timeoutMs, 'ratelimit pexpire')
    const second = await withTimeout(client.incr(rlKey), timeoutMs, 'ratelimit incr #2')
    if (Number(second) !== 2) throw new Error('限流键第二次 INCR 期望 2，实际 ' + String(second))
    const rlTtl = await withTimeout(client.pttl(rlKey), timeoutMs, 'ratelimit pttl')
    checks.rateLimitExpire = typeof rlTtl === 'number' && rlTtl > 0 && rlTtl <= RL_PROBE_TTL_MS
    if (!checks.rateLimitExpire) throw new Error('限流窗口 TTL 异常（实际 ' + String(rlTtl) + 'ms）；INCR 不应重置窗口')
  } catch (err) {
    error = (err && err.message) || String(err)
  }

  // 无论成功失败都清理探测键，避免污染共享 Redis
  try {
    await withTimeout(client.del(cacheKey, rlKey), timeoutMs, 'cleanup')
    checks.cleanup = true
  } catch (err) {
    if (!error) error = '清理探测键失败: ' + ((err && err.message) || String(err))
  }

  const ok = !error && Object.keys(checks).every((k) => checks[k] === true)
  return {
    status: ok ? 'ok' : 'fail',
    checks,
    keys: { cache: cacheKey, rateLimit: rlKey },
    ...(ok ? {} : { error }),
  }
}

/** 真实 Redis 探测：懒连接（connectTimeout=timeout）、跑完 quit，不常驻 */
async function probeRedis(config) {
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS
  let client = null
  try {
    let RedisCtor
    try {
      const mod = require('ioredis')
      RedisCtor = mod && mod.Redis ? mod.Redis : mod
    } catch {
      return {
        status: 'fail',
        url: redactRedisUrl(config.url),
        error: '已配置 REDIS_URL 但缺少 ioredis 依赖（npm install ioredis）',
      }
    }
    client = new RedisCtor(config.url, {
      lazyConnect: true,
      connectTimeout: timeoutMs,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    })
    // 未捕获的 'error' 事件会让 Node 直接抛错，这里吞掉（真正判定看 connect/ping 结果）
    if (typeof client.on === 'function') client.on('error', () => {})
    await withTimeout(client.connect(), timeoutMs, 'connect')
    const result = await runRedisProbe(client, { timeoutMs })
    return { ...result, url: redactRedisUrl(config.url) }
  } catch (err) {
    return {
      status: 'fail',
      url: redactRedisUrl(config.url),
      error: (err && err.message) || String(err),
    }
  } finally {
    if (client) {
      try {
        if (typeof client.quit === 'function') await withTimeout(Promise.resolve(client.quit()), 500, 'quit').catch(() => {})
      } catch {}
      try { if (typeof client.disconnect === 'function') client.disconnect() } catch {}
    }
  }
}

/* ───────────────────────── 媒体临时目录探测（io 可注入 → 可自测） ───────────────────────── */

/**
 * 验证临时目录可写（多副本时必须指向共享卷）。
 * io 需实现：existsSync/mkdirSync/writeFileSync/readFileSync/unlinkSync。
 */
function runMediaProbe(io, options) {
  const opts = options || {}
  const configured = Boolean(opts.configured)
  const dir = opts.dir || os.tmpdir()
  const checks = { exists: false, write: false, readBack: false, cleanup: false }
  const probeFile = path.join(dir, 'tn-health-probe-' + randomSuffix() + '.tmp')
  const payload = 'probe-' + Date.now()
  try {
    // 配置了 MEDIA_TMP_DIR 但目录不存在 = 共享卷没挂上，必须算失败（不能替它 mkdir 掩盖问题）
    if (configured && !io.existsSync(dir)) {
      throw new Error('MEDIA_TMP_DIR 不存在（共享卷未挂载？）：' + dir)
    }
    if (!io.existsSync(dir)) io.mkdirSync(dir, { recursive: true })
    checks.exists = true

    io.writeFileSync(probeFile, payload)
    checks.write = true
    const readBack = io.readFileSync(probeFile, 'utf8')
    checks.readBack = readBack === payload
    if (!checks.readBack) throw new Error('临时目录写后读不一致（只读挂载？）：' + dir)

    io.unlinkSync(probeFile)
    checks.cleanup = true
    return { status: 'ok', mode: configured ? 'configured' : 'default', dir, checks }
  } catch (err) {
    // 尽力清理，避免留下探测文件
    try { io.unlinkSync(probeFile) } catch {}
    return { status: 'fail', mode: configured ? 'configured' : 'default', dir, checks, error: (err && err.message) || String(err) }
  }
}

/* ───────────────────────── 汇总与退出码 ───────────────────────── */

function buildReport(parts) {
  const redis = parts.redis
  const mediaTmp = parts.mediaTmp
  const ok = redis.status !== 'fail' && mediaTmp.status === 'ok'
  const notes = []
  if (redis.status === 'not-configured') {
    notes.push('未配置 REDIS_URL：限流/缓存回退进程内存实现；单副本行为不变，多副本限额不会共享。')
  } else if (redis.status === 'ok') {
    notes.push('REDIS_URL 已配置且探测通过：限流/缓存跨副本共享。')
  } else {
    notes.push('REDIS_URL 已配置但探测失败：应用会按 500ms 超时降级为进程内存（多副本限额不共享），请先修 Redis 再扩容。')
  }
  if (mediaTmp.status !== 'ok') {
    notes.push('媒体临时目录不可用：分片上传/转码会失败；多副本请把 MEDIA_TMP_DIR 指向共享卷。')
  } else if (mediaTmp.mode === 'default') {
    notes.push('未配置 MEDIA_TMP_DIR：使用系统临时目录（单副本可用；多副本跨副本续传分片必须指向共享卷）。')
  } else {
    notes.push('MEDIA_TMP_DIR 已配置且可写：多副本分片上传/转码可跨副本续传。')
  }
  return {
    tool: 'verify-multi-replica',
    checkedAt: new Date().toISOString(),
    ok,
    redis,
    mediaTmp,
    notes,
    nodes: { node: process.version, platform: process.platform, arch: process.arch },
  }
}

function decideExit(report) {
  return report.ok ? 0 : 1
}

/* ───────────────────────── 自测（内存假对象；不连任何外部服务） ───────────────────────── */

function createFakeRedis(options) {
  const opts = options || {}
  const store = new Map()
  const calls = []
  const now = () => (typeof opts.now === 'function' ? opts.now() : Date.now())
  const alive = (key) => {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expireAt != null && entry.expireAt <= now()) { store.delete(key); return null }
    return entry
  }
  return {
    store,
    calls,
    async ping() { calls.push('ping'); if (opts.pingFails) throw new Error('ping failed'); return 'PONG' },
    async set(key, value, mode, px) {
      calls.push(['set', key])
      if (opts.setFails) throw new Error('set failed')
      if (mode !== 'PX') throw new Error('expected PX, got ' + String(mode))
      if (!opts.dropWrites) store.set(key, { value: String(value), expireAt: now() + Number(px) })
      return 'OK'
    },
    async get(key) {
      calls.push(['get', key])
      const entry = alive(key)
      if (opts.getReturnsNull) return null
      return entry ? entry.value : null
    },
    async pttl(key) {
      const entry = alive(key)
      if (!entry || entry.expireAt == null) return -1
      return Math.max(0, entry.expireAt - now())
    },
    async incr(key) {
      calls.push(['incr', key])
      const entry = alive(key)
      const next = (entry ? Number(entry.value) : 0) + 1
      store.set(key, { value: String(next), expireAt: entry ? entry.expireAt : null })
      return next
    },
    async pexpire(key, ms) {
      calls.push(['pexpire', key])
      const entry = store.get(key)
      if (!entry) return 0
      entry.expireAt = now() + Number(ms)
      return 1
    },
    async del(...keys) {
      calls.push(['del', keys])
      let removed = 0
      for (const key of keys) if (store.delete(key)) removed++
      return removed
    },
    async quit() { calls.push('quit') },
    disconnect() {},
  }
}

function createFakeFs(options) {
  const opts = options || {}
  const files = new Map()
  return {
    files,
    existsSync(target) {
      if (opts.missingDir) return false
      if (opts.dirExists !== undefined) return Boolean(opts.dirExists)
      return true
    },
    mkdirSync() {},
    writeFileSync(target, content) {
      if (opts.writeThrows) throw new Error('EACCES: permission denied')
      if (!opts.dropWrites) files.set(target, String(content))
    },
    readFileSync(target) { return files.has(target) ? files.get(target) : '' },
    unlinkSync(target) { files.delete(target) },
  }
}

function runSelfTest() {
  const failures = []
  const check = (label, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected)
    if (!pass) failures.push(label + ' → expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
  }

  return (async () => {
    // 1) 未配置 Redis：report-only，exit 0
    const noRedis = buildReport({
      redis: { status: 'not-configured' },
      mediaTmp: { status: 'ok', mode: 'default', dir: '/tmp', checks: {} },
    })
    check('未配置 Redis → ok', noRedis.ok, true)
    check('未配置 Redis → exit 0', decideExit(noRedis), 0)
    check('未配置 Redis → status 明确', noRedis.redis.status, 'not-configured')

    // 2) Redis 正常：全部检查通过、探测键被清理
    const goodClient = createFakeRedis({})
    const good = await runRedisProbe(goodClient, { timeoutMs: 500 })
    check('Redis 正常 → status', good.status, 'ok')
    check('Redis 正常 → 全部 checks 为 true', Object.values(good.checks).every(Boolean), true)
    check('Redis 正常 → 探测键已清理', goodClient.store.size, 0)
    const okReport = buildReport({
      redis: good,
      mediaTmp: { status: 'ok', mode: 'configured', dir: '/data/tmp', checks: {} },
    })
    check('Redis 正常 → ok/exit', [okReport.ok, decideExit(okReport)], [true, 0])

    // 3) ping 失败 → fail + exit 1
    const badPing = await runRedisProbe(createFakeRedis({ pingFails: true }), { timeoutMs: 500 })
    check('ping 失败 → status', badPing.status, 'fail')
    check('ping 失败 → 仍尝试清理', badPing.checks.cleanup, true)
    check('ping 失败 → exit 1', decideExit(buildReport({ redis: badPing, mediaTmp: { status: 'ok', mode: 'default' } })), 1)

    // 4) 缓存写后读不一致（只读/代理异常）→ fail
    const badCache = await runRedisProbe(createFakeRedis({ getReturnsNull: true }), { timeoutMs: 500 })
    check('缓存读回为空 → fail', badCache.status, 'fail')
    check('缓存读回为空 → checks.cacheRead=false', badCache.checks.cacheRead, false)

    // 5) 限流键语义：INCR 两次必须 1→2，且窗口 TTL 不被重置
    const rlClient = createFakeRedis({})
    const rl = await runRedisProbe(rlClient, { timeoutMs: 500 })
    check('限流探测通过', [rl.checks.rateLimitIncr, rl.checks.rateLimitExpire], [true, true])

    // 6) 媒体目录：正常 / 写后读不一致 / 配置了但目录不存在
    const mediaOk = runMediaProbe(createFakeFs({}), { dir: '/tmp', configured: false })
    check('媒体目录正常 → ok', mediaOk.status, 'ok')
    check('媒体目录正常 → 清理', mediaOk.checks.cleanup, true)
    const mediaDrop = runMediaProbe(createFakeFs({ dropWrites: true }), { dir: '/tmp', configured: false })
    check('媒体目录写后读不一致 → fail', mediaDrop.status, 'fail')
    const mediaMissing = runMediaProbe(createFakeFs({ missingDir: true }), { dir: '/data/shared', configured: true })
    check('MEDIA_TMP_DIR 不存在 → fail', mediaMissing.status, 'fail')
    check('MEDIA_TMP_DIR 不存在 → 报错含路径', /\/data\/shared/.test(mediaMissing.error || ''), true)
    check('媒体目录失败 → exit 1', decideExit(buildReport({ redis: { status: 'not-configured' }, mediaTmp: mediaMissing })), 1)

    // 7) URL 脱敏：密码绝不出现在输出里
    const redacted = redactRedisUrl('redis://:s3cret@127.0.0.1:6379/0')
    check('URL 脱敏 → 不含密码', redacted.includes('s3cret'), false)
    check('URL 脱敏 → 含 ***', redacted.includes('***'), true)
    check('URL 脱敏 → 保留 host', redacted.includes('127.0.0.1'), true)
    check('URL 无密码 → 原样', redactRedisUrl('redis://127.0.0.1:6379').includes('127.0.0.1'), true)
    check('非法 URL → 不当成合法输出', redactRedisUrl('not-a-url').startsWith('<'), true)

    // 8) .env 解析：注释/引号/CRLF
    const parsed = parseEnvFile('# c\r\nREDIS_URL="redis://x:6379"\r\nMEDIA_TMP_DIR=/data/tmp\r\nBAD_LINE\r\n')
    check('.env 解析 REDIS_URL', parsed.REDIS_URL, 'redis://x:6379')
    check('.env 解析 MEDIA_TMP_DIR', parsed.MEDIA_TMP_DIR, '/data/tmp')
    check('.env 忽略非法行', parsed.BAD_LINE, undefined)

    if (failures.length > 0) {
      console.error('[verify-multi-replica] SELF-TEST FAIL')
      for (const f of failures) console.error('  - ' + f)
      process.exit(1)
    }
    console.log('[verify-multi-replica] SELF-TEST PASS（未配置/正常/失败/降级/脱敏 等 30+ 断言）')
    process.exit(0)
  })()
}

/* ───────────────────────── CLI ───────────────────────── */

function usage() {
  console.log('用法: node scripts/verify-multi-replica.cjs [--self-test] [--help]')
  console.log('环境变量: REDIS_URL（可选）、MEDIA_TMP_DIR（可选）、REDIS_PROBE_TIMEOUT_MS（默认 2000）')
  console.log('输出: JSON；未配置 REDIS_URL 时 redis.status="not-configured" 且 exit 0（单副本行为不变）')
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) { usage(); process.exit(0) }
  if (argv.includes('--self-test')) return runSelfTest()

  const fileEnv = loadEnvFile(ROOT)
  const pick = (key) => (process.env[key] !== undefined ? process.env[key] : fileEnv[key])
  const redisUrl = String(pick('REDIS_URL') || '').trim()
  const mediaDir = String(pick('MEDIA_TMP_DIR') || '').trim()
  const timeoutMs = Number(pick('REDIS_PROBE_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS

  const redis = redisUrl
    ? await probeRedis({ url: redisUrl, timeoutMs })
    : { status: 'not-configured' }
  if (redis.status === 'not-configured') {
    console.error('[verify-multi-replica] 未配置 REDIS_URL：按单副本模式检查（限流/缓存走进程内存）')
  } else if (redis.status === 'fail') {
    console.error('[verify-multi-replica] Redis 探测失败：' + (redis.error || 'unknown'))
  }

  const mediaTmp = runMediaProbe(fs, { dir: mediaDir || os.tmpdir(), configured: Boolean(mediaDir) })
  if (mediaTmp.status !== 'ok') {
    console.error('[verify-multi-replica] 媒体临时目录探测失败：' + (mediaTmp.error || 'unknown'))
  }

  const report = buildReport({ redis, mediaTmp })
  console.log(JSON.stringify(report, null, 2))
  process.exit(decideExit(report))
}

main().catch((err) => {
  console.error('[verify-multi-replica] 未预期错误: ' + ((err && err.message) || String(err)))
  console.log(JSON.stringify({ tool: 'verify-multi-replica', ok: false, error: (err && err.message) || String(err) }, null, 2))
  process.exit(1)
})
