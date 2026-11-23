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
    changelog: process.env.APP_CHANGELOG || '启动与加载提速：字体子集化并把中文衬线移出首屏关键路径、品牌图 75KB→1.3KB、旅程地图 GeoJSON 改为首屏后懒加载；首页桌面树移出移动包（首屏 JS 476→268KB）；接口数据本地快照优先，热启动直接出内容；列表与相册改用缩略图变体（单图 8MB→24KB）；启动图与 WebView 底色改为品牌奶油色，不再闪白',
    forceUpdate,
    sha256: APP_APK_SHA256,
    size: APP_APK_SIZE,
    minSupportedBuild: APP_MIN_SUPPORTED_BUILD,
    rolloutPercent: APP_ROLLOUT_PERCENT,
  })
}
