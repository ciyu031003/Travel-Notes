/**
 * B5：LRU 清理选择（纯函数）。
 * 关键约束：待上传队列引用的文件**绝不删**；最久未访问的先删；缩略图最后才动。
 */
import { describe, it, expect } from 'vitest'
import { MEDIA_QUOTA_BYTES, planLruEviction, type MediaFileEntry } from '@/lib/media/local-files'

function entry(path: string, size: number, lastUsed: number, queued = false): MediaFileEntry {
  return { path, size, lastUsed, queued }
}

describe('B5 · LRU 配额', () => {
  it('未超配额：一个都不删', () => {
    const plan = planLruEviction([entry('media/a.jpg', 100, 1), entry('media/b.jpg', 200, 2)], 1000)
    expect(plan.remove).toEqual([])
    expect(plan.freedBytes).toBe(0)
    expect(plan.remainBytes).toBe(300)
    expect(plan.totalBytes).toBe(300)
  })

  it('超配额：按 lastUsed 从旧到新删到配额内', () => {
    const entries = [
      entry('media/new.jpg', 400, 300),
      entry('media/old.jpg', 400, 100),
      entry('media/mid.jpg', 400, 200),
    ]
    const plan = planLruEviction(entries, 500)
    expect(plan.remove.map((e) => e.path)).toEqual(['media/old.jpg', 'media/mid.jpg'])
    expect(plan.freedBytes).toBe(800)
    expect(plan.remainBytes).toBe(400)
  })

  it('待上传队列里的文件永不删除（哪怕它最旧最大）', () => {
    const entries = [
      entry('media/pending.jpg', 900, 1, true),
      entry('media/synced.jpg', 900, 2),
      entry('media/thumb-1.jpg', 100, 3),
    ]
    const plan = planLruEviction(entries, 500)
    expect(plan.remove.map((e) => e.path)).not.toContain('media/pending.jpg')
    expect(plan.remove.map((e) => e.path)).toContain('media/synced.jpg')
  })

  it('缩略图排在最后（同样超配额时先删大图）', () => {
    const entries = [
      entry('media/x-thumb.jpg', 100, 1), // 最旧，但是缩略图
      entry('media/x.jpg', 900, 2),
    ]
    const plan = planLruEviction(entries, 500)
    expect(plan.remove.map((e) => e.path)).toEqual(['media/x.jpg'])
  })

  it('protectThumbs：连缩略图都不删（极端保守模式）', () => {
    const entries = [
      entry('media/x-thumb.jpg', 900, 1),
      entry('media/y.jpg', 900, 2),
    ]
    const plan = planLruEviction(entries, 500, { protectThumbs: true })
    expect(plan.remove.map((e) => e.path)).toEqual(['media/y.jpg'])
  })

  it('非法规格回退到默认配额（400MB），不丢数据', () => {
    const plan = planLruEviction([entry('media/a.jpg', 10, 1)], 0)
    expect(plan.quotaBytes).toBe(MEDIA_QUOTA_BYTES)
    expect(plan.remove).toEqual([])
  })

  it('每条路径最多出现一次（避免重复删）', () => {
    const plan = planLruEviction([entry('media/a.jpg', 600, 1), entry('media/a.jpg', 600, 1)], 100)
    expect(new Set(plan.remove.map((e) => e.path)).size).toBe(plan.remove.length)
  })
})
