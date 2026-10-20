/**
 * 移动端 App 版本（OTA 版本更新用）。
 * 服务端读 APP_VERSION，客户端（静态壳构建）读 NEXT_PUBLIC_APP_VERSION，缺省回落 1.8.0。
 */
export const APP_VERSION = process.env.APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || '1.27.0'

/** 递增的构建号（每次发版 +1，用于客户端判断是否有更新） */
export const APP_BUILD_NUMBER = Number(process.env.APP_BUILD_NUMBER || process.env.NEXT_PUBLIC_APP_BUILD_NUMBER || 58)

/** 新版 APK 下载地址（可经环境变量覆盖；NEXT_PUBLIC_ 供客户端页面/壳内联使用） */
export const APP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL ||
  process.env.APP_DOWNLOAD_URL ||
  'https://travel-notes.yuanabd.cn/downloads/tiantu.apk'

/**
 * APK 完整性校验值（P2-30）。
 *
 * 来源：发版时对最终 APK 跑 `Get-FileHash -Algorithm SHA256` 得到，写进部署环境变量。
 * 客户端（原生）下载完成后用它校验；**服务端没配就返回空字符串**，
 * 客户端在空值时跳过校验（保持对旧部署的兼容，不会把正常更新判成损坏包）。
 */
export const APP_APK_SHA256 = (process.env.APP_APK_SHA256 || process.env.NEXT_PUBLIC_APP_APK_SHA256 || '').toLowerCase()

/** APK 字节数（用于下载前展示体积、下载后长度快校验）；0 = 未知 */
export const APP_APK_SIZE = Number(process.env.APP_APK_SIZE || process.env.NEXT_PUBLIC_APP_APK_SIZE || 0)

/** 低于该 buildNumber 的客户端必须强制更新（0 = 不强制）；用于封掉已知有问题的旧版本 */
export const APP_MIN_SUPPORTED_BUILD = Number(
  process.env.APP_MIN_SUPPORTED_BUILD || process.env.NEXT_PUBLIC_APP_MIN_SUPPORTED_BUILD || 0,
)

/** 灰度比例 0-100（100 = 全量）；服务端无会话标识时客户端按本机随机数取模 */
export const APP_ROLLOUT_PERCENT = Math.min(
  100,
  Math.max(0, Number(process.env.APP_ROLLOUT_PERCENT || process.env.NEXT_PUBLIC_APP_ROLLOUT_PERCENT || 100)),
)

/** 版本比较：b > a 返回 true（按 x.y.z 语义化版本） */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (y > x) return true
    if (y < x) return false
  }
  return false
}
