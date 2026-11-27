import { NextResponse } from 'next/server'
import {
  APP_VERSION,
  APP_BUILD_NUMBER,
  APP_DOWNLOAD_URL,
  APP_APK_SHA256,
  APP_APK_SIZE,
  APP_MIN_SUPPORTED_BUILD,
  APP_ROLLOUT_PERCENT,
} from '@/lib/app-version'

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
  /**
   * P2-30：新增字段全部**向后兼容**（旧客户端忽略未知字段即可）。
   *  · sha256 / size：下载完整性与体积展示（原生侧下载后校验，见 AppUpdaterPlugin）；
   *  · minSupportedBuild：低于它的客户端必须更新（封掉已知有问题的旧版本）；
   *  · rolloutPercent：灰度比例（100 = 全量，缺省即全量，所以不配也不改变现有行为）。
   */
  return NextResponse.json({
    version: APP_VERSION,
    buildNumber: APP_BUILD_NUMBER,
    downloadUrl: APP_DOWNLOAD_URL,
    changelog: process.env.APP_CHANGELOG || '体验精修：我的空间/旅行计划/新建旅行/相册统一动效语言与页面切换编排；相册真实书本开合、折角翻页、连翻惯性、3D 倾斜、长按放大；新建旅行分层进场与无跳变折叠；修复画册 StrictMode 空白、画册深链打不开、中文 slug 记录页打不开',
    forceUpdate,
    sha256: APP_APK_SHA256,
    size: APP_APK_SIZE,
    minSupportedBuild: APP_MIN_SUPPORTED_BUILD,
    rolloutPercent: APP_ROLLOUT_PERCENT,
  })
}
