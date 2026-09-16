// 版本与编码自检：发版前跑一次，避免"改完版本但文件坏了"这类问题进构建。
// 用法：node scripts/verify-version.cjs [期望版本] [期望构建号]
const fs = require('fs')

const expectVersion = process.argv[2] || null
const expectBuild = process.argv[3] ? Number(process.argv[3]) : null

const results = []
let failed = false

function check(label, ok, detail) {
  results.push(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed = true
}

function readUtf8NoBom(file) {
  const buf = fs.readFileSync(file)
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  const text = buf.toString('utf8')
  const ctrl = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)
  return { text, hasBom, ctrl }
}

// 1) package.json 可解析、无 BOM、无控制字符（坏文件会让 docker 里 npm ci 直接 EJSONPARSE 失败）
const pkgRaw = readUtf8NoBom('package.json')
check('package.json 无 BOM', !pkgRaw.hasBom)
check('package.json 无非法控制字符', !pkgRaw.ctrl)
let pkg = null
try {
  pkg = JSON.parse(pkgRaw.text)
  check('package.json 可解析', true, 'version=' + pkg.version)
} catch (e) {
  check('package.json 可解析', false, e.message)
}

// 2) build-mobile.cjs 的 shebang 完好（被写入 BOM 会变成 SyntaxError）
const mob = readUtf8NoBom('scripts/build-mobile.cjs')
check('build-mobile.cjs 无 BOM', !mob.hasBom)
check('build-mobile.cjs shebang 完好', mob.text.startsWith('#!/usr/bin/env node'))

// 3) 各处版本号一致
const appVer = readUtf8NoBom('lib/app-version.ts')
const gradle = readUtf8NoBom('android/app/build.gradle')
const versionIn = (t, re) => (t.match(re) || [])[1] || null

const vPkg = pkg ? pkg.version : null
const vApp = versionIn(appVer.text, /NEXT_PUBLIC_APP_VERSION \|\| '([^']+)'/)
const vGradle = versionIn(gradle.text, /versionName "([^"]+)"/)
const vMobile = versionIn(mob.text, /NEXT_PUBLIC_APP_VERSION: process\.env\.NEXT_PUBLIC_APP_VERSION \|\| '([^']+)'/)

check('版本号四处一致', new Set([vPkg, vApp, vGradle, vMobile]).size === 1, `pkg=${vPkg} app=${vApp} gradle=${vGradle} mobile=${vMobile}`)

const bApp = Number(versionIn(appVer.text, /NEXT_PUBLIC_APP_BUILD_NUMBER \|\| (\d+)/))
const bGradle = Number(versionIn(gradle.text, /versionCode (\d+)/))
const bMobile = Number(versionIn(mob.text, /NEXT_PUBLIC_APP_BUILD_NUMBER: process\.env\.NEXT_PUBLIC_APP_BUILD_NUMBER \|\| '(\d+)'/))
check('构建号三处一致', new Set([bApp, bGradle, bMobile]).size === 1, `app=${bApp} gradle=${bGradle} mobile=${bMobile}`)

// 4) 期望值（可选）
if (expectVersion) check(`版本 == ${expectVersion}`, vPkg === expectVersion, `实际 ${vPkg}`)
if (expectBuild !== null) check(`构建号 == ${expectBuild}`, bApp === expectBuild, `实际 ${bApp}`)

console.log(results.join('\n'))
if (failed) {
  console.error('\n版本/编码自检未通过')
  process.exit(1)
}
console.log('\n版本/编码自检通过')
