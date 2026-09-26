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
    changelog: process.env.APP_CHANGELOG || '修：新建旅行后报错进不去、旅行里没有编辑/添加行程/删除按钮（同步未即时上传且云端ID未回填）；新增：把已有旅行放进情侣/家庭/朋友空间，主人与成员可一起编辑，只读成员只能查看',
    forceUpdate,
  })
}
