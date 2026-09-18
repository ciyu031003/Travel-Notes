#!/usr/bin/env node
/**
 * 版本号递增（通用版）：读当前值 → 写到目标版本/构建号。
 *
 * 为什么重写：之前每次发版都复制一个 `bump-version-<版本>.cjs`，包里已经堆了两个
 * 写着旧版本号的一次性脚本（`bump-version.cjs` 1.8→1.9、`bump-version-1.10.0.cjs`），
 * 复用性差还容易改错文件。这里改成读 `package.json` 的当前值 + 命令行传目标值。
 *
 * 用法：
 *   node scripts/bump-version.cjs 1.11.0 12
 *   node scripts/bump-version.cjs 1.11.0 12 --changelog "本次更新说明"
 *   node scripts/bump-version.cjs            # 只打印当前版本，不改文件
 *
 * 用 Node 精确改文件（不用 PowerShell Get-Content/Set-Content）：
 * 那条路径会写 BOM 并改编码，曾把 package.json 的中文描述写坏、
 * 也弄坏过 .cjs 的 shebang（BOM 在 shebang 前 → SyntaxError）。
 */
const fs = require('fs')

const args = process.argv.slice(2)
const targetVersion = args[0] || null
const targetBuild = args[1] ? String(Number(args[1])) : null
const changelogIdx = args.indexOf('--changelog')
const changelog = changelogIdx >= 0 ? args[changelogIdx + 1] : null

const read = (file) => fs.readFileSync(file, 'utf8')
const write = (file, text) => fs.writeFileSync(file, text, 'utf8') // 无 BOM

const pkgPath = 'package.json'
const curVersion = JSON.parse(read(pkgPath)).version

const appVersionPath = 'lib/app-version.ts'
const curBuild = (read(appVersionPath).match(/NEXT_PUBLIC_APP_BUILD_NUMBER \|\| (\d+)/) || [])[1]

if (!targetVersion || !targetBuild) {
  console.log(`当前版本：${curVersion} / build ${curBuild}`)
  console.log('未传目标版本，仅做只读检查。用法：node scripts/bump-version.cjs <version> <build> [--changelog "..."]')
  process.exit(0)
}

if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error(`✗ 版本号格式应为 x.y.z，收到：${targetVersion}`)
  process.exit(1)
}

const edits = [
  [pkgPath, [[`"version": "${curVersion}"`, `"version": "${targetVersion}"`]]],
  [
    appVersionPath,
    [
      [`|| '${curVersion}'`, `|| '${targetVersion}'`],
      [`NEXT_PUBLIC_APP_BUILD_NUMBER || ${curBuild}`, `NEXT_PUBLIC_APP_BUILD_NUMBER || ${targetBuild}`],
    ],
  ],
  [
    'android/app/build.gradle',
    [
      [`versionCode ${curBuild}`, `versionCode ${targetBuild}`],
      [`versionName "${curVersion}"`, `versionName "${targetVersion}"`],
    ],
  ],
  [
    'scripts/build-mobile.cjs',
    [
      [`|| '${curVersion}'`, `|| '${targetVersion}'`],
      [`|| '${curBuild}'`, `|| '${targetBuild}'`],
    ],
  ],
]

if (changelog) {
  const routePath = 'app/api/version/route.ts'
  const route = read(routePath)
  const m = route.match(/process\.env\.APP_CHANGELOG \|\| '([^']*)'/)
  if (!m) {
    console.error('✗ 未在 app/api/version/route.ts 找到 APP_CHANGELOG 默认值')
    process.exit(1)
  }
  edits.push([
    routePath,
    [[`process.env.APP_CHANGELOG || '${m[1]}'`, `process.env.APP_CHANGELOG || '${changelog}'`]],
  ])
}

let failed = false
for (const [file, pairs] of edits) {
  let text = read(file)
  for (const [from, to] of pairs) {
    if (!text.includes(from)) {
      console.error(`!! ${file}: 未找到待替换内容 -> ${JSON.stringify(from)}`)
      failed = true
      continue
    }
    text = text.split(from).join(to)
  }
  write(file, text)
  console.log(`ok ${file}`)
}

if (failed) {
  console.error('\n有替换未命中，版本号可能处于不一致状态 —— 请检查后重跑 verify-version.cjs')
  process.exit(1)
}

console.log(`\n版本：${curVersion}/build ${curBuild} → ${targetVersion}/build ${targetBuild}`)
console.log(`下一步：node scripts/verify-version.cjs ${targetVersion} ${targetBuild}`)
