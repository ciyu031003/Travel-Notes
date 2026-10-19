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

/**
 * 写文本文件（UTF-8）。
 *
 * 与 writeLocalFile 的区别：writeLocalFile 的字符串按 **base64** 语义处理（二进制约定），
 * 而迁移备份是 JSON 文本，必须显式 encoding UTF8，否则写进去的是一堆乱码字节。
 */
export async function writeTextFile(path: string, text: string, dir: FsDir = 'Data'): Promise<void> {
  if (!isNativePlatform()) {
    webStore.set('text:' + dir + '/' + path, text)
    return
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  await Filesystem.writeFile({ path, data: text, directory: Directory[dir], encoding: Encoding.UTF8, recursive: true })
}

/** 读文本文件（UTF-8）；不存在/异常返回 null */
export async function readTextFile(path: string, dir: FsDir = 'Data'): Promise<string | null> {
  if (!isNativePlatform()) return webStore.get('text:' + dir + '/' + path) ?? null
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  try {
    const res = await Filesystem.readFile({ path, directory: Directory[dir], encoding: Encoding.UTF8 })
    return typeof res.data === 'string' ? res.data : null
  } catch {
    return null
  }
}

/**
 * 文件体积与最后修改时间（B5：LRU 清理依据）。
 * 不存在 / 插件异常返回 null（调用方按"未知"跳过，绝不因此中断清理）。
 */
export async function statLocalFile(
  path: string,
  dir: FsDir = 'Data',
): Promise<{ size: number; mtime: number } | null> {
  if (!isNativePlatform()) {
    const data = webStore.get(dir + '/' + path) ?? webStore.get('text:' + dir + '/' + path)
    if (data == null) return null
    return { size: data.length, mtime: 0 }
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  try {
    const res = await Filesystem.stat({ path, directory: Directory[dir] })
    return { size: Number(res.size) || 0, mtime: Number(res.mtime) || 0 }
  } catch {
    return null
  }
}

/** 列出目录下的文件名（不存在/插件异常返回空数组，供清理逻辑使用） */
export async function listLocalFiles(path: string, dir: FsDir = 'Data'): Promise<string[]> {
  if (!isNativePlatform()) {
    const prefix = dir + '/' + path + '/'
    return Array.from(webStore.keys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const res = await Filesystem.readdir({ path, directory: Directory[dir] }).catch(() => null)
  return (res?.files ?? []).map((f) => f.name)
}

/** 递归删除目录（登出清理媒体用；不存在/异常静默） */
export async function deleteLocalDir(path: string, dir: FsDir = 'Data'): Promise<void> {
  if (!isNativePlatform()) {
    const prefix = dir + '/' + path + '/'
    for (const k of Array.from(webStore.keys())) {
      if (k.startsWith(prefix)) webStore.delete(k)
    }
    return
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.rmdir({ path, directory: Directory[dir], recursive: true }).catch(() => {})
}

/** 确保目录存在（幂等） */
export async function ensureLocalDir(path: string, dir: FsDir = 'Data'): Promise<void> {
  if (!isNativePlatform()) return
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.mkdir({ path, directory: Directory[dir], recursive: true }).catch(() => {})
}
