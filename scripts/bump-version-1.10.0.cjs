/**
 * 版本号递增（1.9.0/build 10 → 1.10.0/build 11）。
 *
 * 用 Node 精确改文件（不用 PowerShell Get-Content/Set-Content）：
 * PowerShell 那条路径会改文件编码并写入 BOM，曾把 package.json 的 UTF-8 中文描述写坏、
 * 也弄坏过 .cjs 的 shebang（shebang 前多一个 BOM → `SyntaxError: Invalid or unexpected token`）。
 */
const fs = require('fs')

const OLD_VERSION = '1.9.0'
const NEW_VERSION = '1.10.0'
const OLD_BUILD = '10'
const NEW_BUILD = '11'

const OLD_CHANGELOG =
  '新建旅行重做：目的地与日期区间一处填完、自动算天数并生成标题、建完直接进入该旅行；修复未登录打开「我的」一直转圈的问题'
const NEW_CHANGELOG =
  '旅行记录闭环：建完的旅行可编辑标题/目的地/日期，并按天记一笔（可传照片）与添加景点行程；新增「加一天」；旅行画册同步收录回忆照片'

const edits = [
  ['package.json', [[`"version": "${OLD_VERSION}"`, `"version": "${NEW_VERSION}"`]]],
  [
    'lib/app-version.ts',
    [
      [`|| '${OLD_VERSION}'`, `|| '${NEW_VERSION}'`],
      [`NEXT_PUBLIC_APP_BUILD_NUMBER || ${OLD_BUILD}`, `NEXT_PUBLIC_APP_BUILD_NUMBER || ${NEW_BUILD}`],
    ],
  ],
  [
    'android/app/build.gradle',
    [
      [`versionCode ${OLD_BUILD}`, `versionCode ${NEW_BUILD}`],
      [`versionName "${OLD_VERSION}"`, `versionName "${NEW_VERSION}"`],
    ],
  ],
  [
    'scripts/build-mobile.cjs',
    [
      [`|| '${OLD_VERSION}'`, `|| '${NEW_VERSION}'`],
      [`|| '${OLD_BUILD}'`, `|| '${NEW_BUILD}'`],
    ],
  ],
  ['app/api/version/route.ts', [[`process.env.APP_CHANGELOG || '${OLD_CHANGELOG}'`, `process.env.APP_CHANGELOG || '${NEW_CHANGELOG}'`]]],
]

let failed = false
for (const [file, pairs] of edits) {
  let text = fs.readFileSync(file, 'utf8')
  for (const [from, to] of pairs) {
    if (!text.includes(from)) {
      console.error(`!! ${file}: 未找到待替换内容 -> ${JSON.stringify(from)}`)
      failed = true
      continue
    }
    text = text.split(from).join(to)
  }
  fs.writeFileSync(file, text, 'utf8') // 无 BOM
  console.log(`ok ${file}`)
}

// 校验
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
console.log('package.json version =', pkg.version)
console.log(
  'build.gradle:',
  fs
    .readFileSync('android/app/build.gradle', 'utf8')
    .match(/versionCode \d+[\s\S]*?versionName "[^"]+"/)[0]
    .replace(/\s+/g, ' '),
)
process.exit(failed ? 1 : 0)
