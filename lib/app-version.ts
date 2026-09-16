/**
 * 绉诲姩绔?App 鐗堟湰锛圤TA 鐗堟湰鏇存柊鐢級銆?
 * 鏈嶅姟绔 APP_VERSION锛屽鎴风锛堥潤鎬佸３鏋勫缓锛夎 NEXT_PUBLIC_APP_VERSION锛岀己鐪佸洖钀?1.9.0銆?
 */
export const APP_VERSION = process.env.APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || '1.9.0'

/** 閫掑鐨勬瀯寤哄彿锛堟瘡娆″彂鐗?+1锛岀敤浜庡鎴风鍒ゆ柇鏄惁鏈夋洿鏂帮級 */
export const APP_BUILD_NUMBER = Number(process.env.APP_BUILD_NUMBER || process.env.NEXT_PUBLIC_APP_BUILD_NUMBER || 10)

/** 鏂扮増 APK 涓嬭浇鍦板潃锛堝彲缁忕幆澧冨彉閲忚鐩栵紱NEXT_PUBLIC_ 渚涘鎴风椤甸潰/澹冲唴鑱斾娇鐢級 */
export const APP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL ||
  process.env.APP_DOWNLOAD_URL ||
  'https://travel-notes.yuanabd.cn/downloads/tiantu.apk'

/** 鐗堟湰姣旇緝锛歜 > a 杩斿洖 true锛堟寜 x.y.z 璇箟鍖栫増鏈級 */
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
