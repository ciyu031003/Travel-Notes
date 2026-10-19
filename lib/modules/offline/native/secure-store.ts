/**
 * Android Keystore 密钥桥（C1）。
 *
 * 契约：返回 base64 的 32 字节随机口令，用于 SQLite（SQLCipher）加密。
 *  · 原生端：由 SecureStorePlugin 在 AndroidKeyStore 里生成 AES/GCM 密钥，
 *    口令只以密文 + IV 形式存 SharedPreferences（见 android/.../SecureStorePlugin.java）；
 *  · Web / 插件缺失 / 解密失败：一律返回 null，调用方据此决定"降级明文打开"还是"报错"。
 *
 * 为什么返回 null 而不是抛错：离线层初始化是全 App 的前置条件，
 * 一个可选安全增强不应该让整个离线功能崩掉；调用方（sqlite-db）会在降级时记录
 * lastInitError，界面上「数据与同步」能看到原因。
 */
import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from '../platform'

export interface SecureStorePlugin {
  /** 取或首次生成数据库口令（base64） */
  getOrCreateSecret(): Promise<{ secret?: string }>
}

/**
 * 懒注册：registerPlugin 本身在 Web/SSR 上安全，但"模块导入即注册"会让
 * 服务端渲染/静态导出在构建期多一次无意义的 Capacitor 桥初始化。
 * 这里改成首次调用时才注册（与 AppUpdater 的用法保持一致）。
 */
let plugin: SecureStorePlugin | null = null
function getPlugin(): SecureStorePlugin {
  if (!plugin) plugin = registerPlugin<SecureStorePlugin>('SecureStore')
  return plugin
}

/** undefined = 尚未取过；null = 取过但不可用 */
let cached: string | null | undefined

export async function getOrCreateDbSecret(): Promise<string | null> {
  if (!isNativePlatform()) return null
  if (cached !== undefined) return cached
  try {
    const res = await getPlugin().getOrCreateSecret()
    const secret = typeof res?.secret === 'string' && res.secret.length > 0 ? res.secret : null
    cached = secret
    if (!secret) console.warn('[offline] SecureStore 未返回口令，SQLite 将以未加密模式打开')
    return secret
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[offline] SecureStore 调用失败，SQLite 将以未加密模式打开:', msg)
    cached = null
    return null
  }
}

/** 测试/诊断用：清掉进程内缓存（例如 Keystore 恢复到可用后的重试） */
export function resetDbSecretCache(): void {
  cached = undefined
}
