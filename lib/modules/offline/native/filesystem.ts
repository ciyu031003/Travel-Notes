/**
 * 本地文件系统封装（Stage 3.3）。
 * 原生端走 @capacitor/filesystem（动态 import + 平台守卫），Web 端内存降级。
 * 二进制文件约定：data 传 base64 字符串，不传 encoding。
 */
import { isNativePlatform } from '../platform'

// 目录名用枚举 KEY（Data/Cache/...），运行时经 Directory[dir] 映射为插件枚举
export type FsDir = 'Data' | 'Cache' | 'Documents' | 'Library' | 'External'

const webStore = new Map<string, string>()

/** 写本地文件（二进制：data 为 base64 字符串） */
export async function writeLocalFile(path: string, data: string, dir: FsDir = 'Data'): Promise<void> {
  if (!isNativePlatform()) {
    webStore.set(dir + '/' + path, data)
    return
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.writeFile({ path, data, directory: Directory[dir], recursive: true })
}

/** 读本地文件（返回 base64 字符串） */
export async function readLocalFile(path: string, dir: FsDir = 'Data'): Promise<string> {
  if (!isNativePlatform()) return webStore.get(dir + '/' + path) ?? ''
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const res = await Filesystem.readFile({ path, directory: Directory[dir] })
  return typeof res.data === 'string' ? res.data : ''
}

/** 取本地文件 URI（可直接用于 <img src>） */
export async function getLocalUri(path: string, dir: FsDir = 'Data'): Promise<string> {
  if (!isNativePlatform()) return ''
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const res = await Filesystem.getUri({ path, directory: Directory[dir] })
  return res.uri
}

/** 删除本地文件 */
export async function deleteLocalFile(path: string, dir: FsDir = 'Data'): Promise<void> {
  if (!isNativePlatform()) {
    webStore.delete(dir + '/' + path)
    return
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.deleteFile({ path, directory: Directory[dir] }).catch(() => {})
}

/** 确保目录存在（幂等） */
export async function ensureLocalDir(path: string, dir: FsDir = 'Data'): Promise<void> {
  if (!isNativePlatform()) return
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.mkdir({ path, directory: Directory[dir], recursive: true }).catch(() => {})
}
