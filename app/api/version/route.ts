import { NextResponse } from 'next/server'
import { APP_VERSION, APP_BUILD_NUMBER, APP_DOWNLOAD_URL } from '@/lib/app-version'

export const dynamic = 'force-dynamic'

/**
 * OTA 版本检查端点：移动端 App 启动时拉取，与服务端最新版本比较。
 * 返回最新版本号 / 构建号 / APK 下载地址，客户端据此提示「发现新版本」并引导下载安装。
 */
export async function GET() {
  return NextResponse.json({
    version: APP_VERSION,
    buildNumber: APP_BUILD_NUMBER,
    downloadUrl: APP_DOWNLOAD_URL,
    changelog: '优化体验，支持离线浏览与自动同步',
    forceUpdate: false,
  })
}
