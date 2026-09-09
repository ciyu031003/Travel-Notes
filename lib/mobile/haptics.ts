/**
 * 触觉反馈封装（iOS 观感）：
 * - 仅 Capacitor 原生容器生效，Web / SSR 一律 no-op；
 * - 动态 import @capacitor/haptics，避免 Web 包体与 SSR 报错；
 * - 统一触点：Tab 切换 / 按压按钮 = light，下拉刷新触发 = medium，
 *   登录成功 = success，失败 = error，选择器等 = selection。
 */

import { isNativePlatform } from '@/lib/modules/offline/platform'
import type { HapticsPlugin, ImpactStyle, NotificationType } from '@capacitor/haptics'

let cached: HapticsPlugin | null | undefined

async function getHaptics(): Promise<HapticsPlugin | null> {
  if (cached !== undefined) return cached
  if (!isNativePlatform()) {
    cached = null
    return null
  }
  try {
    const mod = await import('@capacitor/haptics')
    cached = mod.Haptics ?? null
  } catch {
    cached = null
  }
  return cached
}

export async function hapticLight(): Promise<void> {
  const h = await getHaptics()
  if (!h) return
  await h.impact({ style: 'LIGHT' as ImpactStyle }).catch(() => {})
}

export async function hapticMedium(): Promise<void> {
  const h = await getHaptics()
  if (!h) return
  await h.impact({ style: 'MEDIUM' as ImpactStyle }).catch(() => {})
}

export async function hapticHeavy(): Promise<void> {
  const h = await getHaptics()
  if (!h) return
  await h.impact({ style: 'HEAVY' as ImpactStyle }).catch(() => {})
}

export async function hapticSuccess(): Promise<void> {
  const h = await getHaptics()
  if (!h) return
  await h.notification({ type: 'SUCCESS' as NotificationType }).catch(() => {})
}

export async function hapticError(): Promise<void> {
  const h = await getHaptics()
  if (!h) return
  await h.notification({ type: 'ERROR' as NotificationType }).catch(() => {})
}

export async function hapticSelection(): Promise<void> {
  const h = await getHaptics()
  if (!h) return
  await h.selectionStart().catch(() => {})
  await h.selectionChanged().catch(() => {})
  await h.selectionEnd().catch(() => {})
}
