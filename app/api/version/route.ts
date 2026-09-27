import { NextResponse } from 'next/server'
import { APP_VERSION, APP_BUILD_NUMBER, APP_DOWNLOAD_URL } from '@/lib/app-version'

export const dynamic = 'force-dynamic'

/**
 * OTA 版本检查端点：移动端 App 启动时拉取，与服务端最新版本比较。
 * 返回最新版本号 / 构建号 / APK 下载地址，客户端据此提示「发现新版本」并引导下载安装。
 *
 * changelog：随发版更新（门户下载弹窗与 App 更新提示都会展示这一行）。
 * 可用 APP_CHANGELOG 环境变量覆盖，免于为此改代码重新构建。
 */
export async function GET() {
  // 部署时 APP_FORCE_UPDATE=1 开启强制更新（默认不强制）
  const forceUpdate = process.env.APP_FORCE_UPDATE === '1'
  return NextResponse.json({
    version: APP_VERSION,
    buildNumber: APP_BUILD_NUMBER,
    downloadUrl: APP_DOWNLOAD_URL,
    changelog: process.env.APP_CHANGELOG || '移动端 iOS 化精修 2.0：按压弹簧回弹、弹层跟手拖拽与退场动画、方向感知页面转场、大标题滚动折叠、下拉刷新 iOS 化、状态栏随主题联动、边缘右滑返回',
    forceUpdate,
  })
}
