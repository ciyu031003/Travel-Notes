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
    changelog: process.env.APP_CHANGELOG || '备案信息补全：网站（yuanabd.cn 及子域名）ICP 备案号 赣ICP备2024031528号-2、工信部备案号 30178737190355077、公安联网备案号 粤公网安备44010602017246号，与甜途 App 备案号 赣ICP备2024031528号-4A 一并展示在网站页脚与 App 内（登录页/首页/账号设置-关于/下载页），编号均可点击跳转工信部备案系统与全国互联网安全管理服务平台',
    forceUpdate,
  })
}
