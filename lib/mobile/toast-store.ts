/**
 * 轻提示命令式 store（与组件解耦，任意页面可调用）：
 * toast.success('已保存') / toast.error('网络异常') / toast.info('...')。
 * ToastHost 订阅渲染，自动消失。
 */

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  duration: number
}

type Listener = (items: ToastItem[]) => void

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit(): void {
  const snapshot = [...items]
  listeners.forEach((listener) => listener(snapshot))
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener([...items])
  return () => {
    listeners.delete(listener)
  }
}

export function dismissToast(id: number): void {
  if (!items.some((item) => item.id === id)) return
  items = items.filter((item) => item.id !== id)
  emit()
}

function push(kind: ToastKind, message: string, duration = 2600): void {
  if (typeof window === 'undefined') return
  const id = nextId++
  items = [...items, { id, kind, message, duration }]
  emit()
  window.setTimeout(() => dismissToast(id), duration)
}

export const toast = {
  success: (message: string): void => push('success', message),
  error: (message: string): void => push('error', message, 3400),
  info: (message: string): void => push('info', message),
}
