/**
 * P4：媒体读取侧「本地优先」回归。
 *
 * 锁住的东西（这些都是真机上会直接表现为「照片白屏/闪白」的契约）：
 *  ① 按 mediaId **一次 SQL** 批量解析本地原图/缩略图，不是 N+1；
 *  ② 离线新建、尚未上传（remoteUrl = NULL）的照片能解析到本地文件（旧逻辑永远解析不到）；
 *  ③ 上传成功后原图删掉、localPath 指向缩略图 → 仍能解析（本地小图）；
 *  ④ DB 行指向的文件已被 LRU 清理 → 不给本地路径（自动回退远端，不渲染破图）；
 *  ⑤ 按 remoteUrl 批量解析同样是一次 SQL（相册封面 / 照片墙路径）；
 *  ⑥ Web 端恒不查库、本地命中转成 convertFileSrc 后的地址；
 *  ⑦ hook 层：同帧请求合并成一次批量查询 + 命中缓存后不再查库 + 失效后不再尝试本地。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const box = vi.hoisted(() => ({
  native: true,
  files: new Set<string>(),
  rows: [] as Array<{ id: string; localPath: string | null; remoteUrl: string | null }>,
  sql: [] as Array<{ sql: string; values?: unknown[] }>,
  getUriCalls: [] as string[],
  dirUri: 'file:///data/user/0/com.tiantu/files/media',
}))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => box.native }))

vi.mock('@/lib/modules/offline/native/filesystem', () => ({
  listLocalFiles: async (dir: string) =>
    Array.from(box.files)
      .filter((path) => path.startsWith(dir + '/'))
      .map((path) => path.slice(dir.length + 1)),
  getLocalUri: async (path: string) => {
    box.getUriCalls.push(path)
    if (path === 'media') return box.dirUri
    return box.dirUri + '/' + path.replace(/^media\//, '')
  },
  statLocalFile: async () => null,
  writeLocalFile: async () => {},
  ensureLocalDir: async () => {},
  deleteLocalFile: async () => {},
  readLocalFile: async () => '',
  writeTextFile: async () => {},
  readTextFile: async () => null,
  deleteLocalDir: async () => {},
}))

vi.mock('@/lib/modules/offline/native/sqlite-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/modules/offline/native/sqlite-db')>()
  return {
    ...actual,
    getOfflineDb: async () => ({
      query: async (sql: string, values?: unknown[]) => {
        box.sql.push({ sql, values })
        // 只实现本文件用到的两种批量查询（其余（如 PRAGMA）返回空）
        if (sql.includes('WHERE id IN (')) {
          const wanted = new Set((values ?? []).map((value) => String(value)))
          return { values: box.rows.filter((row) => wanted.has(row.id)) }
        }
        if (sql.includes('WHERE remoteUrl IN (')) {
          const wanted = new Set((values ?? []).map((value) => String(value)))
          return { values: box.rows.filter((row) => row.remoteUrl != null && wanted.has(row.remoteUrl)) }
        }
        return { values: [] }
      },
      run: async () => ({ changes: { changes: 1 } }),
    }),
  }
})

vi.mock('@/lib/modules/offline/sync-queue', () => ({ SyncQueue: class { async pending() { return [] } } }))
vi.mock('@/lib/modules/offline/storage', () => ({ getSyncQueueStorage: () => ({}) }))

import {
  localMediaCacheKey,
  pickLocalMediaFile,
  pickLocalMediaPath,
  resolveLocalMediaHitsByIds,
  resolveLocalMediaPaths,
  resolveLocalMediaPathsByRemote,
  resolveLocalMediaUrisByRemote,
  resolveMediaUrl,
  resolveMediaUrlByRemote,
  resolveMediaUrlsByRemote,
  resetLocalMediaUriCacheForTest,
  toDisplayableLocalUri,
  toLocalMediaRef,
} from '@/lib/modules/offline/media'
import {
  __localMediaCacheSizeForTest,
  __resetLocalMediaCacheForTest,
  forgetLocalMedia,
  isLocalMediaUsable,
  resolveLocalMediaUriQueued,
  type LocalMediaSource,
} from '@/hooks/use-local-media-url'

const NATIVE_PREFIX = 'http://localhost/_capacitor_file_'

beforeEach(() => {
  box.native = true
  box.files.clear()
  box.rows = []
  box.sql = []
  box.getUriCalls = []
  resetLocalMediaUriCacheForTest()
  __resetLocalMediaCacheForTest()
  // 模拟原生壳里的 Capacitor.convertFileSrc：file:// → http://localhost/_capacitor_file_/…
  vi.stubGlobal('window', {
    Capacitor: {
      convertFileSrc: (uri: string) => NATIVE_PREFIX + uri.replace(/^file:\/+/, '/'),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('P4 · 本地媒体批量解析（按 mediaId）', () => {
  it('一次 SQL 解析整批（绝不 N+1）', async () => {
    box.rows = [
      { id: 'm1', localPath: 'media/m1.jpg', remoteUrl: '/uploads/media/1.jpg' },
      { id: 'm2', localPath: 'media/m2.jpg', remoteUrl: '/uploads/media/2.jpg' },
      { id: 'm3', localPath: 'media/m3.jpg', remoteUrl: '/uploads/media/3.jpg' },
    ]
    box.files.add('media/m1.jpg')
    box.files.add('media/m2.jpg')
    box.files.add('media/m3.jpg')

    const map = await resolveLocalMediaPaths(['m1', 'm2', 'm3'])

    expect(box.sql.filter((entry) => entry.sql.includes('WHERE id IN ('))).toHaveLength(1)
    expect(box.sql[0].values).toEqual(['m1', 'm2', 'm3'])
    expect(Object.keys(map)).toHaveLength(3)
    expect(map.m1.localPath).toBe('media/m1.jpg')
    expect(map.m1.pendingUpload).toBe(false)
  })

  it('离线新建、尚未上传（remoteUrl = NULL）的照片 → 能解析到本地文件', async () => {
    box.rows = [{ id: 'local-1', localPath: 'media/local-1.jpg', remoteUrl: null }]
    box.files.add('media/local-1.jpg')
    box.files.add('media/local-1-thumb.jpg')

    const map = await resolveLocalMediaPaths(['local-1'])

    expect(map['local-1'].localPath).toBe('media/local-1.jpg')
    expect(map['local-1'].thumbPath).toBe('media/local-1-thumb.jpg')
    expect(map['local-1'].remoteUrl).toBeNull()
    expect(map['local-1'].pendingUpload).toBe(true)

    // 这正是旧逻辑的死角：没有 remoteUrl 的照片以前永远拿不到本地文件
    const hits = await resolveLocalMediaHitsByIds(['local-1'], 'original')
    expect(hits['local-1'].uri).toBe(NATIVE_PREFIX + '/data/user/0/com.tiantu/files/media/local-1.jpg')
    expect(hits['local-1'].viaThumb).toBe(false)
  })

  it('上传成功后原图已删、localPath 指向缩略图 → 仍能解析（viaThumb 标给调用方）', async () => {
    box.rows = [{ id: 'm9', localPath: 'media/m9-thumb.jpg', remoteUrl: '/uploads/media/9.jpg' }]
    box.files.add('media/m9-thumb.jpg')

    const paths = (await resolveLocalMediaPaths(['m9'])).m9
    expect(paths.localPath).toBeNull()
    expect(paths.thumbPath).toBe('media/m9-thumb.jpg')

    const hits = await resolveLocalMediaHitsByIds(['m9'], 'original')
    expect(hits.m9.viaThumb).toBe(true)
  })

  it('DB 行指向的文件已被 LRU 清理 → 不给本地路径（自动回退远端）', async () => {
    box.rows = [{ id: 'gone', localPath: 'media/gone.jpg', remoteUrl: '/uploads/media/gone.jpg' }]
    // 盘上没有 gone.jpg，也没有缩略图

    const map = await resolveLocalMediaPaths(['gone'])

    expect(map.gone.localPath).toBeNull()
    expect(map.gone.thumbPath).toBeNull()
    expect(await resolveMediaUrl('gone', '/uploads/media/gone.jpg')).toBe('/uploads/media/gone.jpg')
  })

  it('没有 media 行 → 空结果（不抛错）', async () => {
    expect(await resolveLocalMediaPaths(['nope'])).toEqual({})
    expect(await resolveLocalMediaHitsByIds(['nope'])).toEqual({})
  })
})

describe('P4 · 本地媒体批量解析（按 remoteUrl）', () => {
  it('一次 SQL 解析整批并返回 url → 本地地址', async () => {
    box.rows = [
      { id: 'm1', localPath: 'media/m1.jpg', remoteUrl: '/uploads/media/1.jpg' },
      { id: 'm2', localPath: 'media/m2.jpg', remoteUrl: '/uploads/media/2.jpg' },
    ]
    box.files.add('media/m1.jpg')
    box.files.add('media/m2.jpg')

    const uris = await resolveLocalMediaUrisByRemote(['/uploads/media/1.jpg', '/uploads/media/2.jpg'])

    expect(box.sql.filter((entry) => entry.sql.includes('WHERE remoteUrl IN ('))).toHaveLength(1)
    expect(Object.keys(uris).sort()).toEqual(['/uploads/media/1.jpg', '/uploads/media/2.jpg'])
    expect(uris['/uploads/media/1.jpg']).toBe(NATIVE_PREFIX + '/data/user/0/com.tiantu/files/media/m1.jpg')
    // 旧 API 语义保持：只返回命中项
    expect(await resolveMediaUrlsByRemote(['/uploads/media/1.jpg', '/uploads/media/missing.jpg'])).toEqual({
      '/uploads/media/1.jpg': NATIVE_PREFIX + '/data/user/0/com.tiantu/files/media/m1.jpg',
    })
  })

  it('按 remoteUrl 解析无命中时保持远端 URL', async () => {
    expect(await resolveMediaUrlByRemote('/uploads/media/none.jpg')).toBe('/uploads/media/none.jpg')
  })

  it('media 目录基址只取一次（批量 N 张不产生 N 次插件调用）', async () => {
    box.rows = Array.from({ length: 6 }, (_, i) => ({
      id: 'b' + i,
      localPath: 'media/b' + i + '.jpg',
      remoteUrl: '/uploads/media/b' + i + '.jpg',
    }))
    for (let i = 0; i < 6; i++) box.files.add('media/b' + i + '.jpg')

    const uris = await resolveLocalMediaUrisByRemote(box.rows.map((row) => row.remoteUrl as string), 'thumb')
    expect(Object.keys(uris)).toHaveLength(6)
    expect(box.getUriCalls).toEqual(['media'])
  })
})

describe('P4 · 平台与地址转换', () => {
  it('Web 端：不查库、不返回本地地址', async () => {
    box.native = false
    box.rows = [{ id: 'm1', localPath: 'media/m1.jpg', remoteUrl: '/uploads/media/1.jpg' }]
    box.files.add('media/m1.jpg')

    expect(await resolveLocalMediaPaths(['m1'])).toEqual({})
    expect(await resolveLocalMediaUrisByRemote(['/uploads/media/1.jpg'])).toEqual({})
    expect(await resolveMediaUrl('m1', '/uploads/media/1.jpg')).toBe('/uploads/media/1.jpg')
    expect(box.sql).toHaveLength(0)
  })

  it('没有 Capacitor.convertFileSrc 时退回 file://（不崩）', async () => {
    vi.stubGlobal('window', {})
    box.rows = [{ id: 'm1', localPath: 'media/m1.jpg', remoteUrl: null }]
    box.files.add('media/m1.jpg')
    expect(await toDisplayableLocalUri('media/m1.jpg')).toBe('file:///data/user/0/com.tiantu/files/media/m1.jpg')
  })
})

describe('P4 · 纯函数：偏好与降级判断', () => {
  const paths = {
    mediaId: 'm1',
    localPath: 'media/m1.jpg' as string | null,
    thumbPath: 'media/m1-thumb.jpg' as string | null,
    remoteUrl: '/uploads/media/1.jpg' as string | null,
    pendingUpload: false,
  }

  it('原图偏好优先原图，缩略图偏好优先缩略图；缺失时互相回退', () => {
    expect(pickLocalMediaPath(paths, 'original')).toBe('media/m1.jpg')
    expect(pickLocalMediaPath(paths, 'thumb')).toBe('media/m1-thumb.jpg')
    expect(pickLocalMediaPath({ ...paths, localPath: null }, 'original')).toBe('media/m1-thumb.jpg')
    expect(pickLocalMediaPath({ ...paths, thumbPath: null }, 'thumb')).toBe('media/m1.jpg')
    expect(pickLocalMediaPath(null)).toBeNull()
  })

  it('viaThumb 正确标记「降级到缩略图」', () => {
    expect(pickLocalMediaFile(paths, 'original')).toEqual({ path: 'media/m1.jpg', viaThumb: false })
    expect(pickLocalMediaFile({ ...paths, localPath: null }, 'original')).toEqual({
      path: 'media/m1-thumb.jpg',
      viaThumb: true,
    })
  })

  it('isLocalMediaUsable：大图只命中缩略图时在线走远端、离线才用本地', () => {
    const local: LocalMediaSource = {
      url: 'http://localhost/_capacitor_file_/x.jpg',
      source: 'local',
      viaThumb: true,
      invalidate: () => {},
    }
    expect(isLocalMediaUsable(local, { wantsLarge: true, hasRemote: true, online: true })).toBe(false)
    expect(isLocalMediaUsable(local, { wantsLarge: true, hasRemote: true, online: false })).toBe(true)
    expect(isLocalMediaUsable(local, { wantsLarge: true, hasRemote: false, online: true })).toBe(true)
    expect(isLocalMediaUsable({ ...local, viaThumb: false }, { wantsLarge: true, hasRemote: true, online: true })).toBe(true)
    expect(isLocalMediaUsable({ ...local, source: 'remote', url: '' })).toBe(false)
  })

  it('引用归一化与缓存键：mediaId 优先、裸值兼容', () => {
    expect(toLocalMediaRef(12)).toEqual({ mediaId: 12 })
    expect(toLocalMediaRef('/uploads/media/1.jpg')).toEqual({ remoteUrl: '/uploads/media/1.jpg' })
    expect(toLocalMediaRef({ mediaId: 12, remoteUrl: '/uploads/media/1.jpg' })).toEqual({
      mediaId: 12,
      remoteUrl: '/uploads/media/1.jpg',
    })
    expect(toLocalMediaRef('  ')).toBeNull()
    expect(localMediaCacheKey({ mediaId: 12, remoteUrl: '/a.jpg' }, 'thumb')).toBe('id:12#thumb')
    expect(localMediaCacheKey({ remoteUrl: '/a.jpg' }, 'original')).toBe('url:/a.jpg#original')
  })
})

describe('P4 · hook 层：同帧合并与缓存', () => {
  it('同一帧内多张图只发一次批量 SQL，且各自拿到本地地址', async () => {
    box.rows = [
      { id: 'm1', localPath: 'media/m1.jpg', remoteUrl: null },
      { id: 'm2', localPath: 'media/m2.jpg', remoteUrl: null },
      { id: 'm3', localPath: 'media/m3.jpg', remoteUrl: null },
    ]
    box.files.add('media/m1.jpg')
    box.files.add('media/m2.jpg')
    box.files.add('media/m3.jpg')

    const [a, b, c] = await Promise.all([
      resolveLocalMediaUriQueued({ mediaId: 'm1' }),
      resolveLocalMediaUriQueued({ mediaId: 'm2' }),
      resolveLocalMediaUriQueued({ mediaId: 'm3' }),
    ])

    expect(box.sql.filter((entry) => entry.sql.includes('WHERE id IN ('))).toHaveLength(1)
    expect(a.uri).toBe(NATIVE_PREFIX + '/data/user/0/com.tiantu/files/media/m1.jpg')
    expect(b.uri).toBe(NATIVE_PREFIX + '/data/user/0/com.tiantu/files/media/m2.jpg')
    expect(c.uri).toBe(NATIVE_PREFIX + '/data/user/0/com.tiantu/files/media/m3.jpg')
  })

  it('命中缓存后不再查库；forget 之后不再尝试本地（回退远端）', async () => {
    box.rows = [{ id: 'm1', localPath: 'media/m1.jpg', remoteUrl: '/uploads/media/1.jpg' }]
    box.files.add('media/m1.jpg')

    const first = await resolveLocalMediaUriQueued({ mediaId: 'm1' })
    const queriesAfterFirst = box.sql.length
    expect(first.uri).toContain('/media/m1.jpg')

    const second = await resolveLocalMediaUriQueued({ mediaId: 'm1' })
    expect(second).toEqual(first)
    expect(box.sql.length).toBe(queriesAfterFirst)
    expect(__localMediaCacheSizeForTest()).toBeGreaterThan(0)

    forgetLocalMedia({ mediaId: 'm1' })
    const afterForget = await resolveLocalMediaUriQueued({ mediaId: 'm1' })
    expect(afterForget.uri).toBe('')
    expect(box.sql.length).toBe(queriesAfterFirst)
  })

  it('Web 端：hook 层解析直接返回空（不发查询）', async () => {
    box.native = false
    const entry = await resolveLocalMediaUriQueued({ mediaId: 'm1' })
    expect(entry.uri).toBe('')
    expect(box.sql).toHaveLength(0)
  })
})
