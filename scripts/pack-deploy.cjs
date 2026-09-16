// 打包部署包并**就地自检**：确认归档里的关键文件是好的，再上传。
// 教训：曾出现"修复只落在工作区、但归档取 HEAD"，导致坏文件进了 docker 构建（npm ci EJSONPARSE）。
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const out = path.join(os.tmpdir(), 'tn-deploy.tar.gz')
execFileSync('git', ['archive', '--format=tar.gz', '-o', out, 'HEAD'], { stdio: 'inherit' })
console.log('打包完成:', out, (fs.statSync(out).size / 1024 / 1024).toFixed(1) + ' MB')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-'))
execFileSync('tar', ['-xzf', out, '-C', tmp, 'package.json', 'package-lock.json'], { stdio: 'inherit' })

function readUtf8NoBom(file) {
  const buf = fs.readFileSync(path.join(tmp, file))
  return {
    hasBom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    text: buf.toString('utf8'),
  }
}

let ok = true
const pkg = readUtf8NoBom('package.json')
if (pkg.hasBom) { console.error('✗ 归档 package.json 带 BOM'); ok = false }
if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(pkg.text)) { console.error('✗ 归档 package.json 含非法控制字符'); ok = false }
try {
  const j = JSON.parse(pkg.text)
  console.log('✓ 归档 package.json 可解析, version =', j.version)
} catch (e) {
  console.error('✗ 归档 package.json 解析失败:', e.message)
  ok = false
}

const lock = readUtf8NoBom('package-lock.json')
try {
  JSON.parse(lock.text)
  console.log('✓ 归档 package-lock.json 可解析')
} catch (e) {
  console.error('✗ 归档 package-lock.json 解析失败:', e.message)
  ok = false
}

fs.rmSync(tmp, { recursive: true, force: true })
if (!ok) { console.error('\n归档自检未通过，不要上传'); process.exit(1) }
console.log('归档自检通过')
