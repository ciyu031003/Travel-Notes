// 版本号递增：1.8.0/build 9 → 1.9.0/build 10
// 用 Node 精确改写（不用 PowerShell Get-Content/Set-Content：
// 那条路径会改文件编码并写入 BOM，曾把 package.json 的 UTF-8 中文描述写坏、也弄坏过 .cjs 的 shebang）。
const fs = require('fs')

const edits = [
  ['package.json', [['"version": "1.8.0"', '"version": "1.9.0"']]],
  ['lib/app-version.ts', [
    ["|| '1.8.0'", "|| '1.9.0'"],
    ['NEXT_PUBLIC_APP_BUILD_NUMBER || 9', 'NEXT_PUBLIC_APP_BUILD_NUMBER || 10'],
  ]],
  ['android/app/build.gradle', [
    ['versionCode 9', 'versionCode 10'],
    ['versionName "1.8.0"', 'versionName "1.9.0"'],
  ]],
  ['scripts/build-mobile.cjs', [
    ["|| '1.8.0'", "|| '1.9.0'"],
    ["|| '9'", "|| '10'"],
  ]],
  ['app/api/version/route.ts', [
    [
      "process.env.APP_CHANGELOG || '旅行画册 2.0：翻页不再整本重建（性能大幅提升）、新增画报/胶片/手记三套主题、图片按需加载与邻页预解码、新增附录页保证照片一张不丢'",
      "process.env.APP_CHANGELOG || '新建旅行重做：目的地与日期区间一处填完、自动算天数并生成标题、建完直接进入该旅行；修复未登录打开「我的」一直转圈的问题'",
    ],
  ]],
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
console.log('build.gradle:', fs.readFileSync('android/app/build.gradle', 'utf8').match(/versionCode \d+[\s\S]*?versionName "[^"]+"/)[0].replace(/\s+/g, ' '))
process.exit(failed ? 1 : 0)
