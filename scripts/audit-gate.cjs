#!/usr/bin/env node
/**
 * npm audit 门禁（P1-25）
 *
 * 背景：CI 里此前的 `npm audit --audit-level=high || true` 是报告模式，24 个 high 永远不会
 * 让流水线变红。这里改成「显式豁免」：high/critical 必须在 scripts/audit-allowlist.json
 * 里有未过期的条目（带 advisory id、包名、到期日、原因），否则退出码非 0。
 *
 * 设计取舍：
 * - 只阻断 high/critical。moderate/low 仍然只打印计数，避免把 43 条存量一次性全变成红灯
 *   （真正常被利用的是 high/critical；低危随上游 patch 收）。
 * - 匹配键是「包名 + advisory id（GHSA 或 npm source）」。只按包名匹配会让同包新增的
 *   advisory 被旧条目顺带放过，失去门禁意义。
 * - 过期条目不算豁免：到期即红灯，逼着续期时重新评估风险（而不是永远躺平）。
 * - npm audit 在有漏洞时退出码本就非 0，stdout 仍是合法 JSON，所以不能用退出码判断失败；
 *   只有拿不到 JSON 才视为门禁自身故障（fail-closed）。
 *
 * 用法：
 *   node scripts/audit-gate.cjs            # CI/本地门禁
 *   node scripts/audit-gate.cjs --list     # 只列 high/critical 与豁免状态，恒退出 0（排查用）
 *   AUDIT_JSON=/path/to/audit.json node scripts/audit-gate.cjs   # 离线复用已有 audit 输出
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const ALLOWLIST_PATH = path.join(__dirname, 'audit-allowlist.json')
const BLOCKING = new Set(['high', 'critical'])
const LIST_ONLY = process.argv.includes('--list')

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function loadAuditJson() {
  if (process.env.AUDIT_JSON) {
    return stripBom(fs.readFileSync(process.env.AUDIT_JSON, 'utf8'))
  }
  try {
    return stripBom(
      execSync('npm audit --json', {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch (error) {
    // 有漏洞时 npm 退出码非 0，但 stdout 仍是 JSON；拿不到 JSON 才是真的失败
    const stdout = error && error.stdout ? stripBom(String(error.stdout)) : ''
    if (stdout.trim().startsWith('{')) return stdout
    throw new Error(`npm audit 未能返回 JSON（检查网络或 npm 是否可用）: ${error && error.message}`)
  }
}

function advisoryId(via) {
  if (typeof via !== 'object' || via === null) return null
  if (typeof via.url === 'string') {
    const ghsa = via.url.match(/GHSA-[a-z0-9-]+/i)
    if (ghsa) return ghsa[0]
  }
  if (via.source !== undefined) return `npm-${via.source}`
  return null
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function loadAllowlist() {
  const raw = JSON.parse(stripBom(fs.readFileSync(ALLOWLIST_PATH, 'utf8')))
  const entries = Array.isArray(raw.entries) ? raw.entries : []
  const now = today()
  const allowed = new Map()
  const expired = new Map()
  for (const entry of entries) {
    if (!entry || typeof entry.package !== 'string') continue
    const target = entry.expires && entry.expires < now ? expired : allowed
    for (const id of entry.advisories || []) {
      target.set(`${entry.package}::${id}`, entry)
    }
  }
  return { entries, allowed, expired, now }
}

function main() {
  const audit = JSON.parse(loadAuditJson())
  const vulns = Object.values(audit.vulnerabilities || {})
  const { entries, allowed, expired, now } = loadAllowlist()

  // 从 audit 输出里抽出 advisory：findings 只收 high/critical（用于阻断），
  // allKeys 收全部严重度（用于判断 allowlist 条目是否还命中，避免把中低危条目误报成失效）。
  const findings = []
  const allKeys = new Set()
  for (const vuln of vulns) {
    const name = vuln.name
    for (const via of vuln.via || []) {
      const id = advisoryId(via)
      if (!id) continue
      allKeys.add(`${name}::${id}`)
      const severity = (via.severity || vuln.severity || '').toLowerCase()
      if (!BLOCKING.has(severity)) continue
      findings.push({
        key: `${name}::${id}`,
        package: name,
        advisory: id,
        severity,
        title: String(via.title || '').slice(0, 120),
        direct: Boolean(vuln.isDirect),
      })
    }
  }
  // 去重（同一 advisory 可能被多个聚合条目引用）
  const unique = [...new Map(findings.map((f) => [f.key, f])).values()].sort(
    (a, b) => a.severity.localeCompare(b.severity) || a.package.localeCompare(b.package),
  )

  const allowedFindings = unique.filter((f) => allowed.has(f.key))
  const expiredFindings = unique.filter((f) => !allowed.has(f.key) && expired.has(f.key))
  const unallowed = unique.filter((f) => !allowed.has(f.key) && !expired.has(f.key))

  console.log('audit-gate: high/critical 共 ' + unique.length + ' 条 advisory')
  for (const f of unique) {
    const mark = allowed.has(f.key) ? 'ok   ' : expired.has(f.key) ? 'EXPIRED' : 'FAIL '
    console.log(`  [${mark}] ${f.severity.padEnd(8)} ${f.package.padEnd(28)} ${f.advisory}  ${f.title}`)
  }

  const metadatas = (audit.metadata && audit.metadata.vulnerabilities) || {}
  console.log(
    'audit-gate: 总量 low=' + (metadatas.low || 0) + ' moderate=' + (metadatas.moderate || 0) +
      ' high=' + (metadatas.high || 0) + ' critical=' + (metadatas.critical || 0),
  )

  // 反向检查：allowlist 里已经不再命中的条目提示清理（不阻断，避免删依赖时误伤）
  const stale = []
  for (const entry of entries) {
    // 只对阻断级别（high/critical）做有效性检查；moderate/low 的 advisory 不进 findings，
    // 否则豁免清单里记录的中低危条目会永远显示「已失效」，变成噪音。
    if (!BLOCKING.has(String(entry.severity || '').toLowerCase())) continue
    for (const id of entry.advisories || []) {
      const key = `${entry.package}::${id}`
      if (!allKeys.has(key)) stale.push(key)
    }
  }
  if (stale.length > 0) {
    console.log('audit-gate: 提示——以下豁免已失效，可删除对应条目: ' + stale.join(', '))
  }

  if (LIST_ONLY) {
    console.log(`audit-gate: --list 模式，已豁免 ${allowedFindings.length} 条、过期 ${expiredFindings.length} 条、未豁免 ${unallowed.length} 条（不阻断）`)
    return
  }

  if (expiredFindings.length > 0) {
    console.error('\naudit-gate: ✗ ' + expiredFindings.length + ' 条 high/critical 的豁免已过期（到期日 ' + now + ' 之前），请修复或续期 scripts/audit-allowlist.json：')
    for (const f of expiredFindings) console.error(`  - ${f.package} ${f.advisory}（${f.severity}）`)
  }
  if (unallowed.length > 0) {
    console.error('\naudit-gate: ✗ ' + unallowed.length + ' 条 high/critical 未豁免，请修复或加入 scripts/audit-allowlist.json（含 reason 与 expires）：')
    for (const f of unallowed) console.error(`  - ${f.package} ${f.advisory}（${f.severity}）${f.title ? ' — ' + f.title : ''}`)
  }

  if (expiredFindings.length > 0 || unallowed.length > 0) {
    process.exit(1)
  }
  console.log('audit-gate: ✓ high/critical 全部有未过期豁免（' + allowedFindings.length + ' 条）')
}

try {
  main()
} catch (error) {
  console.error('audit-gate: ✗ 门禁自身执行失败: ' + (error && error.message))
  process.exit(1)
}
