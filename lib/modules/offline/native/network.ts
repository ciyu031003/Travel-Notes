/**
 * 网络状态封装（Stage 3.3）。
 * 原生端走 @capacitor/network，Web 端用 navigator.onLine + online/offline 事件。
 */
import { isNativePlatform } from '../platform'

export interface ConnectionState {
  connected: boolean
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown'
}

export async function getConnectionStatus(): Promise<ConnectionState> {
  if (!isNativePlatform()) {
    const onLine = typeof navigator !== 'undefined' ? navigator.onLine : false
    return { connected: onLine, connectionType: 'unknown' }
  }
  const { Network } = await import('@capacitor/network')
  const status = await Network.getStatus()
  return { connected: status.connected, connectionType: status.connectionType }
}

/** 监听网络变化，返回取消订阅函数 */
export async function onNetworkChange(listener: (state: ConnectionState) => void): Promise<() => void> {
  if (!isNativePlatform()) {
    const handler = () => listener({ connected: navigator.onLine, connectionType: 'unknown' })
    window.addEventListener('online', handler)
    window.addEventListener('offline', handler)
    return () => {
      window.removeEventListener('online', handler)
      window.removeEventListener('offline', handler)
    }
  }
  const { Network } = await import('@capacitor/network')
  const handle = await Network.addListener('networkStatusChange', (status) => {
    listener({ connected: status.connected, connectionType: status.connectionType })
  })
  return () => handle.remove()
}
