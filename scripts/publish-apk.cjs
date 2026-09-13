#!/usr/bin/env node
/**
 * 发布 release APK 到腾讯云 COS（S3 兼容），并打印生产环境可用的下载地址。
 *
 * 用法（从 .env 读取发布配置）：
 *   node --env-file=.env scripts/publish-apk.cjs
 *
 * 环境变量：
 *   COS_ENDPOINT            必填，例如 https://cos.ap-guangzhou.myqcloud.com
 *   COS_REGION              必填，例如 ap-guangzhou
 *   COS_BUCKET              必填，例如 travel-notes-1300000000
 *   COS_ACCESS_KEY_ID       必填
 *   COS_SECRET_ACCESS_KEY   必填
 *   COS_OBJECT_KEY          可选，默认 downloads/tiantu-<package.json version>.apk
 *   COS_CDN_BASE_URL        可选，公开 CDN 域名，例如 https://dl.yuanabd.cn
 *   APK_PATH                可选，默认 android/app/build/outputs/apk/release/app-release.apk
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')

const pkg = require('../package.json')
const apkPath = path.resolve(
  process.env.APK_PATH ||
    path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
)

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`[publish-apk] 缺少必填环境变量 ${name}。请在【本地开发机根目录 .env】填写后运行：`)
    console.error('  node --env-file=.env scripts/publish-apk.cjs')
    console.error('（发布动作在本地跑即可，不要把生产服务器的 .env 密钥写入服务器仓库）')
    process.exit(1)
  }
  return value
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function main() {
  if (!fs.existsSync(apkPath)) {
    console.error(`[publish-apk] 找不到 APK: ${apkPath}`)
    process.exit(1)
  }

  const endpoint = required('COS_ENDPOINT').replace(/\/+$/, '')
  const region = required('COS_REGION')
  const bucket = required('COS_BUCKET')
  const key = process.env.COS_OBJECT_KEY || `downloads/tiantu-${pkg.version}.apk`
  const cdnBase = (process.env.COS_CDN_BASE_URL || '').replace(/\/+$/, '')

  // 腾讯云 2024-01-01 后创建的 COS 桶只支持虚拟主机风格地址（CName），
  // S3 API 需 forcePathStyle: false，否则签名/地址风格不匹配。
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: false,
    credentials: {
      accessKeyId: required('COS_ACCESS_KEY_ID'),
      secretAccessKey: required('COS_SECRET_ACCESS_KEY'),
    },
  })

  const size = fs.statSync(apkPath).size
  const checksum = await sha256(apkPath)
  console.log(`[publish-apk] 上传 ${apkPath}`)
  console.log(`[publish-apk] 大小 ${(size / 1024 / 1024).toFixed(2)} MB，SHA-256 ${checksum}`)

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(apkPath),
      ContentType: 'application/vnd.android.package-archive',
      ContentDisposition: 'attachment; filename="tiantu.apk"',
      CacheControl: 'public, max-age=31536000',
    })
  )

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  // forcePathStyle=false 时对象地址为虚拟主机风格：https://<bucket>.cos.<region>.myqcloud.com/<key>
  const bucketHost = `${bucket}.cos.${region}.myqcloud.com`
  const objectUrl = `https://${bucketHost}/${key}`
  console.log(`[publish-apk] 上传完成: ${objectUrl} (${head.ContentLength} bytes)`)

  const downloadUrl = cdnBase ? `${cdnBase}/${key}` : objectUrl
  console.log('[publish-apk] 生产环境配置:')
  console.log(`  APP_DOWNLOAD_URL=${downloadUrl}`)
  console.log(`  NEXT_PUBLIC_APP_DOWNLOAD_URL=${downloadUrl}  # 仅重建移动端壳时需要`)
}

main().catch((err) => {
  console.error('[publish-apk] 发布失败:', err)
  process.exit(1)
})
