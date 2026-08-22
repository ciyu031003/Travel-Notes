/**
 * 移动端 App 版本（OTA 版本更新用）。
 * 服务端读 APP_VERSION，客户端（静态壳构建）读 NEXT_PUBLIC_APP_VERSION，缺省回落 2.5.0。
 */
export const APP_VERSION = process.env.APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || '2.6.0'

/** 递增的构建号（每次发版 +1，用于客户端判断是否有更新） */
export const APP_BUILD_NUMBER = Number(process.env.APP_BUILD_NUMBER || process.env.NEXT_PUBLIC_APP_BUILD_NUMBER || 2)

/** 新版 APK 下载地址（可经环境变量覆盖） */
export const APP_DOWNLOAD_URL =
  process.env.APP_DOWNLOAD_URL ||
  'https://travel-notes.yuanabd.cn/downloads/tiantu.apk'

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
