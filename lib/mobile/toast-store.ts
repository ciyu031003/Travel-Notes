/**
 * 轻提示命令式 store（与组件解耦，任意页面可调用）：
 * toast.success('已保存') / toast.error('网络异常') / toast.info('...')。
 * ToastHost 订阅渲染，自动消失。
 *
 * M5 扩展（向后兼容：原有一个参数调用完全不变）：
 *  · options.duration 自定义时长
 *  · options.progress 显示倒计时进度条
 *  · options.action  附一个操作按钮（如「撤销」）
 *  · options.dismissible false 时不给关闭按钮（用于"必须看到"的提示）
 */

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  duration: number
  progress?: boolean
  action?: ToastAction
  dismissible?: boolean
}

export interface ToastOptions {
  duration?: number
  progress?: boolean
  action?: ToastAction
  dismissible?: boolean
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

function push(kind: ToastKind, message: string, options: ToastOptions = {}): number {
  if (typeof window === 'undefined') return 0
  const id = nextId++
  const duration = options.duration ?? 2600
  items = [
    ...items,
    {
      id,
      kind,
      message,
      duration,
      progress: options.progress,
      action: options.action,
      dismissible: options.dismissible,
    },
  ]
  emit()
  window.setTimeout(() => dismissToast(id), duration)
  return id
}

export const toast = {
  success: (message: string, options?: ToastOptions): number =>
    push('success', message, options),
  error: (message: string, options?: ToastOptions): number =>
    push('error', message, { duration: 3400, ...options }),
  info: (message: string, options?: ToastOptions): number => push('info', message, options),
  dismiss: dismissToast,
}
