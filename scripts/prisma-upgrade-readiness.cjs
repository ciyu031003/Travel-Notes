#!/usr/bin/env node
/**
 * prisma-upgrade-readiness.cjs —— Prisma 8 升级就绪门禁（task-34）
 *
 * 为什么需要它：Prisma 8 长期停在 RC，且 @prisma/client 的 stable 版本经常滞后于 prisma CLI。
 * 自动判断三个条件，避免「升级到一半才发现 client 装不上 / Node 不被支持」：
 *   ① prisma 存在 **stable >= 8**（非 prerelease）；
 *   ② @prisma/client 存在与 prisma **同 major.minor** 的 stable 版本；
 *   ③ 目标版本的 engines.node 覆盖当前 Node。
 *
 * 输出 JSON（ready / blocked + 具体版本与原因），未就绪 exit 1；ready exit 0。
 * 用法：
 *   node scripts/prisma-upgrade-readiness.cjs            # 查 npm registry 并输出 JSON
 *   node scripts/prisma-upgrade-readiness.cjs --self-test # 用 mock 数据自测判定逻辑
 * 环境变量：NPM_REGISTRY_URL（默认 https://registry.npmjs.org）
 */
const REGISTRY = (process.env.NPM_REGISTRY_URL || 'https://registry.npmjs.org').replace(/\/$/, '')
const TARGET_MAJOR = 8

/* ───────────────────────── semver 工具（零依赖） ───────────────────────── */

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v || '').trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] || null }
}

function isStable(v) {
  const parsed = parseVersion(v)
  return Boolean(parsed && !parsed.prerelease)
}

function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) throw new Error('invalid version: ' + a + ' / ' + b)
  if (pa.major !== pb.major) return pa.major - pb.major
  if (pa.minor !== pb.minor) return pa.minor - pb.minor
  return pa.patch - pb.patch
}

/** 支持 npm 常见 engines 写法：>=x.y.z / >x / <=x / <x / =x / ^x.y.z / 精确版本 / *，以及 || 组合 */
function nodeSatisfies(range, version) {
  const raw = String(range || '').trim()
  if (!raw || raw === '*' || raw.toLowerCase() === 'x') return true
  const target = parseVersion(version)
  if (!target) return false
  const clauses = raw.split('||').map((part) => part.trim()).filter(Boolean)
  return clauses.some((clause) => {
    const tokens = clause.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return true
    return tokens.every((token) => {
      if (token === '*' || token.toLowerCase() === 'x') return true
      let op = '='
      let rest = token
      if (token.startsWith('>=')) { op = '>='; rest = token.slice(2) }
      else if (token.startsWith('<=')) { op = '<='; rest = token.slice(2) }
      else if (token.startsWith('>')) { op = '>'; rest = token.slice(1) }
      else if (token.startsWith('<')) { op = '<'; rest = token.slice(1) }
      else if (token.startsWith('^')) { op = '^'; rest = token.slice(1) }
      else if (token.startsWith('=')) { op = '='; rest = token.slice(1) }
      rest = rest.trim()
      if (op === '^') {
        const base = parseVersion(rest.length === 1 ? rest + '.0.0' : rest)
        if (!base) return false
        const upperMajor = base.major + 1
        return compareVersions(version, base.major + '.' + base.minor + '.' + base.patch) >= 0 &&
          target.major < upperMajor
      }
      const normalized = rest.length === 1 ? rest + '.0.0' : rest.length === 2 ? rest + '.0.0' : rest
      const base = parseVersion(normalized)
      if (!base) return false
      const cmp = compareVersions(version, normalized)
      if (op === '>=') return cmp >= 0
      if (op === '>') return cmp > 0
      if (op === '<=') return cmp <= 0
      if (op === '<') return cmp < 0
      return cmp === 0
    })
  })
}

/* ───────────────────────── registry 判定逻辑 ───────────────────────── */

function stableVersionsOf(doc) {
  const versions = Object.keys((doc && doc.versions) || {})
  return versions.filter(isStable)
}

function highestVersion(list) {
  return list.reduce((best, current) => (best === null || compareVersions(current, best) > 0 ? current : best), null)
}

function enginesOf(doc, version) {
  const entry = doc && doc.versions && doc.versions[version]
  return (entry && entry.engines) || null
}

function evaluate(input) {
  const prismaDoc = input.prismaDoc || {}
  const clientDoc = input.clientDoc || {}
  const nodeVersion = input.nodeVersion || process.versions.node
  const registry = input.registry || REGISTRY
  const latestTag = (prismaDoc['dist-tags'] && prismaDoc['dist-tags'].latest) || null
  const clientLatestTag = (clientDoc['dist-tags'] && clientDoc['dist-tags'].latest) || null
  const stablePrisma = stableVersionsOf(prismaDoc)
  const stable8 = stablePrisma.filter((v) => parseVersion(v).major >= TARGET_MAJOR)
  const targetPrisma = highestVersion(stable8)
  const highestStableOverall = highestVersion(stablePrisma)
  const blockedReasons = []

  if (!targetPrisma) {
    blockedReasons.push(
      'prisma 没有 stable >= ' + TARGET_MAJOR + '（registry latest=' + (latestTag || 'unknown') + '；最高 stable=' + (highestStableOverall || 'none') + '）',
    )
  }

  let targetClient = null
  if (targetPrisma) {
    const target = parseVersion(targetPrisma)
    const sameLine = stableVersionsOf(clientDoc).filter((v) => {
      const parsed = parseVersion(v)
      return parsed.major === target.major && parsed.minor === target.minor
    })
    targetClient = highestVersion(sameLine)
    if (!targetClient) {
      blockedReasons.push(
        '@prisma/client 没有与 prisma ' + targetPrisma + ' 同 major.minor 的 stable 版本（client latest=' + (clientLatestTag || 'unknown') + '）',
      )
    }
  }

  const prismaEngines = targetPrisma ? enginesOf(prismaDoc, targetPrisma) : null
  const clientEngines = targetClient ? enginesOf(clientDoc, targetClient) : null
  const prismaEnginesOk = prismaEngines && prismaEngines.node ? nodeSatisfies(prismaEngines.node, nodeVersion) : true
  const clientEnginesOk = clientEngines && clientEngines.node ? nodeSatisfies(clientEngines.node, nodeVersion) : true
  if (targetPrisma && !prismaEnginesOk) {
    blockedReasons.push('当前 Node ' + nodeVersion + ' 不在 prisma ' + targetPrisma + ' engines.node（' + prismaEngines.node + '）范围内')
  }
  if (targetClient && !clientEnginesOk) {
    blockedReasons.push('当前 Node ' + nodeVersion + ' 不在 @prisma/client ' + targetClient + ' engines.node（' + clientEngines.node + '）范围内')
  }

  return {
    tool: 'prisma-upgrade-readiness',
    registry,
    ready: blockedReasons.length === 0,
    node: { current: nodeVersion, enginesCovered: Boolean(targetPrisma ? prismaEnginesOk && clientEnginesOk : false) },
    prisma: {
      latestTag,
      latestTagIsStable: isStable(latestTag),
      highestStable: highestStableOverall,
      target: targetPrisma,
      engines: prismaEngines,
    },
    client: {
      latestTag: clientLatestTag,
      highestStable: highestVersion(stableVersionsOf(clientDoc)),
      target: targetClient,
      engines: clientEngines,
    },
    blockedReasons,
    nextSteps: blockedReasons.length === 0
      ? ['条件满足：在独立 worktree 按 docs/review/_impl/UPGRADE-EVALUATION.md 的 Prisma 8 runbook 升级']
      : ['等待 prisma stable 8.x 与 @prisma/client 同版本 stable 发布', '发布后重跑 npm run prisma:ready，再按 runbook 升级'],
  }
}

async function fetchDoc(pkg) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(REGISTRY + '/' + encodeURIComponent(pkg), {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error('registry HTTP ' + res.status + ' for ' + pkg)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const selfTest = process.argv.includes('--self-test')
  if (selfTest) {
    const failures = selfTestCases()
    if (failures.length > 0) {
      console.error('[prisma-readiness] SELF-TEST FAIL: ' + failures.join('; '))
      process.exit(1)
    }
    console.log('[prisma-readiness] SELF-TEST PASS（覆盖 RC-only / client 滞后 / engines 不支持 / 全部就绪 4 类场景）')
    process.exit(0)
  }

  try {
    const [prismaDoc, clientDoc] = await Promise.all([fetchDoc('prisma'), fetchDoc('@prisma/client')])
    const result = evaluate({ prismaDoc, clientDoc, nodeVersion: process.versions.node })
    result.checkedAt = new Date().toISOString()
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ready ? 0 : 1)
  } catch (error) {
    console.log(JSON.stringify({ tool: 'prisma-upgrade-readiness', ready: false, error: String((error && error.message) || error) }, null, 2))
    process.exit(1)
  }
}

/* ───────────────────────── 自测（mock registry 响应） ───────────────────────── */

function selfTestCases() {
  const failures = []
  const check = (label, actual, expected) => {
    if (actual !== expected) failures.push(label + ' expected ' + expected + ' got ' + actual)
  }

  // semver/engines 匹配
  check('caret 24 matches ^24.11.0', nodeSatisfies('^24.11.0', '24.12.0'), true)
  check('caret range excludes 20', nodeSatisfies('^22.18.0 || ^24.11.0 || >=26.0.0', '20.18.0'), false)
  check('range includes 22.18.1', nodeSatisfies('^22.18.0 || ^24.11.0 || >=26.0.0', '22.18.1'), true)
  check('>= matches', nodeSatisfies('>=20.9.0', '24.12.0'), true)
  check('< excludes', nodeSatisfies('<21', '22.0.0'), false)

  const rcOnly = {
    'dist-tags': { latest: '8.0.0-rc.23', prev: '7.10.1' },
    versions: {
      '7.10.1': { engines: { node: '>=20.9.0' } },
      '8.0.0-rc.23': { engines: { node: '^22.18.0 || ^24.11.0 || >=26.0.0' } },
    },
  }
  const client7 = {
    'dist-tags': { latest: '7.10.1' },
    versions: { '7.10.1': { engines: { node: '>=20.9.0' } } },
  }
  const scenarioRcOnly = evaluate({ prismaDoc: rcOnly, clientDoc: client7, nodeVersion: '24.12.0', registry: 'mock://rc-only' })
  check('RC-only blocked', scenarioRcOnly.ready, false)
  check('RC-only reason', scenarioRcOnly.blockedReasons.some((r) => r.includes('没有 stable >= 8')), true)

  const prisma8 = {
    'dist-tags': { latest: '8.0.0' },
    versions: { '8.0.0': { engines: { node: '^22.18.0 || ^24.11.0 || >=26.0.0' } } },
  }
  const scenarioClientMissing = evaluate({ prismaDoc: prisma8, clientDoc: client7, nodeVersion: '24.12.0', registry: 'mock://client-missing' })
  check('client lag blocked', scenarioClientMissing.ready, false)
  check('client lag reason', scenarioClientMissing.blockedReasons.some((r) => r.includes('@prisma/client 没有与 prisma 8.0.0')), true)

  const client8 = {
    'dist-tags': { latest: '8.0.0' },
    versions: { '8.0.0': { engines: { node: '^22.18.0 || ^24.11.0 || >=26.0.0' } } },
  }
  const scenarioNode20 = evaluate({ prismaDoc: prisma8, clientDoc: client8, nodeVersion: '20.18.0', registry: 'mock://node20' })
  check('node20 blocked', scenarioNode20.ready, false)
  check('node20 reason', scenarioNode20.blockedReasons.some((r) => r.includes('engines.node')), true)

  const scenarioReady = evaluate({ prismaDoc: prisma8, clientDoc: client8, nodeVersion: '24.12.0', registry: 'mock://ready' })
  check('ready scenario', scenarioReady.ready, true)
  check('ready picks 8.0.0', scenarioReady.prisma.target, '8.0.0')
  check('ready picks client 8.0.0', scenarioReady.client.target, '8.0.0')

  return failures
}

if (require.main === module) {
  main()
}

module.exports = { parseVersion, isStable, compareVersions, nodeSatisfies, evaluate, selfTestCases }
