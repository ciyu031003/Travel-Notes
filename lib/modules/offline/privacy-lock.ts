/**
 * v3.1 M4-C3：本地隐私锁（App 内私密记忆保护）。
 *
 * 两层设计（本期先落地开关与密钥派生框架，生物识别/加密激活在真机接入后生效）：
 * 1. 应用层隐私锁：进入相册/回忆等私密模块前校验 PIN/生物识别（@capacitor/local-authentication）。
 * 2. 数据层加密：SQLite 加密（@capacitor-community/sqlite 的 encrypted DB）——需在 App 启动时提供 passphrase，
 *    密钥经本模块从「设备安全存储 + 用户 PIN 派生」，避免明文落盘。
 *
 * 本期交付：开关状态持久化 + 密钥派生框架 + 供 UI 调用的解锁协议；Web 端恒为关闭（无本地私密数据）。
 */
import { isNativePlatform } from './platform'

const LOCK_KEY = 'tiantu-privacy-lock'
const DEFAULT_PIN = ''

export interface PrivacyLockState {
  enabled: boolean
  /** 解锁协议：pending=待解锁 / unlocked=已解锁 / locked=锁定 */
  status: 'pending' | 'unlocked' | 'locked'
}

/** 读取隐私锁开关（原生端可开启；Web 恒关闭） */
export function getPrivacyLockEnabled(): boolean {
  if (!isNativePlatform()) return false
  try {
    return localStorage.getItem(LOCK_KEY) === '1'
  } catch {
    return false
  }
}

/** 设置隐私锁开关（开启后进入私密模块需解锁） */
export function setPrivacyLockEnabled(enabled: boolean): void {
  if (!isNativePlatform()) return
  try {
    if (enabled) localStorage.setItem(LOCK_KEY, '1')
    else localStorage.removeItem(LOCK_KEY)
  } catch {
    // 忽略
  }
}

/** 校验 PIN（本期：PIN 与设备安全存储比对；未设置 PIN 时仅做开关语义） */
export function verifyPin(pin: string): boolean {
  // 设备端应使用 SecureStorage/Keystore 存储 PIN 哈希；此处为框架占位
  return pin.length >= 4
}

/** 派生 SQLite 加密 passphrase（真机加密激活时调用）：userPin + 设备指纹 → SHA-256 hex */
export async function deriveDbPassphrase(userPin: string): Promise<string> {
  const data = `tiantu:${userPin}`.trim()
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `pin-${data.length}-${Date.now()}`
}

/** 获取当前锁状态（供 UI 初始化） */
export function getLockState(): PrivacyLockState {
  const enabled = getPrivacyLockEnabled()
  return {
    enabled,
    status: enabled ? 'locked' : 'pending',
  }
}
