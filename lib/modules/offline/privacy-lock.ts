/**
 * 本地隐私锁（C1：替换 v3.1 的空壳实现）。
 *
 * 定位：**UI 门禁**，不是数据加密本身。
 *  · 数据层加密由 SQLCipher + AndroidKeyStore 密钥完成（native/sqlite-db.ts、
 *    native/secure-store.ts），不需要用户 PIN 参与 —— 否则忘记 PIN 等于本地数据全丢；
 *  · PIN 只决定"别人拿起这台已解锁的手机能不能直接看到私密内容"。
 *
 * 实现：4–8 位数字 PIN，随机 salt + SHA-256 存 localStorage（仅原生端）。
 * 为什么不做 PBKDF2 高阶派生：PIN 空间只有 10^4–10^8，任何离线暴力都挡不住；
 * 真正的防线是设备锁屏 + 数据库加密。这里的目标是"挡住顺手翻看"，不是抗定向破解。
 *
 * 会话语义：解锁一次后**本次会话**放行（内存 + sessionStorage）。
 * App 被杀 = 会话结束 → 下次冷启动重新要求 PIN。
 */
import { isNativePlatform } from './platform'

const PIN_KEY = 'tiantu-privacy-pin'
/** 沿用旧 key：升级后「开关曾经打开过」的状态不丢（但旧状态没有 PIN，会被自动修复为关闭） */
const LOCK_ENABLED_KEY = 'tiantu-privacy-lock'
const UNLOCK_SESSION_KEY = 'tiantu-privacy-unlocked'

const MIN_PIN_LENGTH = 4
const MAX_PIN_LENGTH = 8

interface PinRecord {
  /** 十六进制随机盐（16 字节） */
  salt: string
  /** SHA-256(salt + ':' + pin + ':tiantu') 的十六进制 */
  hash: string
  createdAt: number
}

let unlockedInMemory = false

/** 隐私锁只在原生端有意义（Web 没有本地私密数据） */
export function isPrivacyLockSupported(): boolean {
  return isNativePlatform()
}

function readRecord(): PinRecord | null {
  if (!isNativePlatform()) return null
  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PinRecord>
    if (typeof parsed?.salt !== 'string' || typeof parsed?.hash !== 'string') return null
    return { salt: parsed.salt, hash: parsed.hash, createdAt: Number(parsed.createdAt) || 0 }
  } catch {
    return null
  }
}

function writeRecord(record: PinRecord | null): void {
  if (!isNativePlatform()) return
  try {
    if (record) localStorage.setItem(PIN_KEY, JSON.stringify(record))
    else localStorage.removeItem(PIN_KEY)
  } catch {
    // localStorage 不可用：锁功能降级为"不可用"，不影响其它功能
  }
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < byteLength; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return toHex(bytes)
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = salt + ':' + pin + ':tiantu'
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    return toHex(new Uint8Array(buf))
  }
  // 无 Web Crypto 的极端环境（老 WebView）：退化为不可逆性更弱的散列，
  // 但绝不把明文 PIN 落盘。功能可用性优先。
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return 'fnv-' + h.toString(16).padStart(8, '0')
}

export function isValidPin(pin: string): boolean {
  return new RegExp('^\\d{' + MIN_PIN_LENGTH + ',' + MAX_PIN_LENGTH + '}$').test(pin.trim())
}

/** 是否已设置 PIN（决定隐私锁是否能真正启用） */
export function hasPin(): boolean {
  return readRecord() != null
}

/**
 * 设置/重置 PIN。
 * @returns true=成功；false=长度非法或环境不支持
 */
export async function setPin(pin: string): Promise<boolean> {
  if (!isNativePlatform()) return false
  const normalized = pin.trim()
  if (!isValidPin(normalized)) return false
  const salt = randomHex(16)
  const hash = await hashPin(normalized, salt)
  writeRecord({ salt, hash, createdAt: Date.now() })
  // 设置 PIN 的本人当场视为已解锁，避免刚开启就被自己的门禁挡住
  markUnlocked()
  setPrivacyLockEnabled(true)
  return true
}

/** 校验 PIN（从未设置过 → false；错 → false） */
export async function verifyPin(pin: string): Promise<boolean> {
  const record = readRecord()
  if (!record) return false
  const normalized = pin.trim()
  if (!isValidPin(normalized)) return false
  const hash = await hashPin(normalized, record.salt)
  return hash === record.hash
}

/** 清除 PIN 与解锁态（关闭隐私锁时调用） */
export function clearPin(): void {
  writeRecord(null)
  setPrivacyLockEnabled(false)
  lockNow()
}

/** 隐私锁开关（只有设置过 PIN 才算真正开启） */
export function getPrivacyLockEnabled(): boolean {
  if (!isNativePlatform()) return false
  try {
    return localStorage.getItem(LOCK_ENABLED_KEY) === '1' && hasPin()
  } catch {
    return false
  }
}

export function setPrivacyLockEnabled(enabled: boolean): void {
  if (!isNativePlatform()) return
  try {
    if (enabled) localStorage.setItem(LOCK_ENABLED_KEY, '1')
    else localStorage.removeItem(LOCK_ENABLED_KEY)
  } catch {
    // 忽略
  }
  if (!enabled) lockNow()
}

/** 当前是否处于"锁定待解锁"状态 */
export function lockState(): { enabled: boolean; locked: boolean } {
  const enabled = getPrivacyLockEnabled()
  return { enabled, locked: enabled && !isUnlocked() }
}

export function isUnlocked(): boolean {
  if (unlockedInMemory) return true
  if (!isNativePlatform()) return true
  try {
    return sessionStorage.getItem(UNLOCK_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function markUnlocked(): void {
  unlockedInMemory = true
  if (!isNativePlatform()) return
  try {
    sessionStorage.setItem(UNLOCK_SESSION_KEY, '1')
  } catch {
    // 内存标记已生效，够本次会话用
  }
}

/** 立即锁定（登出/手动锁定时调用；下次进入需重新输入 PIN） */
export function lockNow(): void {
  unlockedInMemory = false
  if (!isNativePlatform()) return
  try {
    sessionStorage.removeItem(UNLOCK_SESSION_KEY)
  } catch {
    // 忽略
  }
}

/** 兼容旧调用名（v3.1 的 getLockState） */
export function getLockState(): { enabled: boolean; pinSet: boolean; locked: boolean } {
  const enabled = getPrivacyLockEnabled()
  return { enabled, pinSet: hasPin(), locked: enabled && !isUnlocked() }
}
