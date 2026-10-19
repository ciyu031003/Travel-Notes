/**
 * B5：上传策略纯函数（压缩参数 / 分片阈值 / 分片数）。
 * 这些数值直接决定上行流量与画质，必须钉死。
 */
import { describe, it, expect } from 'vitest'
import {
  HD_MAX_EDGE,
  HD_QUALITY,
  RESUMABLE_THRESHOLD_BYTES,
  THUMB_MAX_EDGE,
  UPLOAD_MAX_EDGE,
  UPLOAD_QUALITY,
  computeScaledSize,
  formatBytes,
  resolveCompressionPlan,
  shouldResize,
  shouldUseResumable,
  totalChunksForBytes,
} from '@/lib/media/upload-policy'

describe('B5 · 压缩策略', () => {
  it('默认：长边 1600 / q0.82 / 转 JPEG', () => {
    const plan = resolveCompressionPlan()
    expect(plan).toEqual({ maxEdge: UPLOAD_MAX_EDGE, quality: UPLOAD_QUALITY, toJpeg: true, hd: false })
    expect(UPLOAD_MAX_EDGE).toBe(1600)
    expect(UPLOAD_QUALITY).toBeCloseTo(0.82, 5)
  })

  it('高清模式：长边 4096 / q0.9', () => {
    const plan = resolveCompressionPlan({ preferHd: true })
    expect(plan.maxEdge).toBe(HD_MAX_EDGE)
    expect(plan.quality).toBeCloseTo(HD_QUALITY, 5)
    expect(plan.hd).toBe(true)
  })

  it('GIF 不重编码（避免丢帧）', () => {
    const plan = resolveCompressionPlan({ mimeType: 'image/gif' })
    expect(plan.toJpeg).toBe(false)
  })
})

describe('B5 · 缩放计算', () => {
  it('横图按长边等比缩小', () => {
    expect(computeScaledSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200, scale: 0.4 })
  })

  it('竖图按高边等比缩小', () => {
    expect(computeScaledSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600, scale: 0.4 })
  })

  it('永不放大（小于上限时保持原尺寸）', () => {
    expect(computeScaledSize(800, 600, 1600)).toEqual({ width: 800, height: 600, scale: 1 })
  })

  it('非法输入不产生 0/NaN 尺寸', () => {
    const size = computeScaledSize(0, -5, 1600)
    expect(size.width).toBeGreaterThanOrEqual(1)
    expect(size.height).toBeGreaterThanOrEqual(1)
  })

  it('shouldResize 只按长边判断', () => {
    expect(shouldResize(1601, 100, 1600)).toBe(true)
    expect(shouldResize(1600, 4000, 1600)).toBe(true)
    expect(shouldResize(1600, 1200, 1600)).toBe(false)
  })
})

describe('B5 · 分片阈值与分片数', () => {
  it('严格大于 2MB 才走分片', () => {
    expect(RESUMABLE_THRESHOLD_BYTES).toBe(2 * 1024 * 1024)
    expect(shouldUseResumable(RESUMABLE_THRESHOLD_BYTES)).toBe(false)
    expect(shouldUseResumable(RESUMABLE_THRESHOLD_BYTES + 1)).toBe(true)
    expect(shouldUseResumable(NaN)).toBe(false)
  })

  it('分片数向上取整，且至少 1 片', () => {
    expect(totalChunksForBytes(0)).toBe(1)
    expect(totalChunksForBytes(1, 512 * 1024)).toBe(1)
    expect(totalChunksForBytes(512 * 1024, 512 * 1024)).toBe(1)
    expect(totalChunksForBytes(512 * 1024 + 1, 512 * 1024)).toBe(2)
    expect(totalChunksForBytes(3 * 1024 * 1024, 512 * 1024)).toBe(6)
  })

  it('缩略图尺寸小于上传尺寸（保证本地副本更小）', () => {
    expect(THUMB_MAX_EDGE).toBeLessThan(UPLOAD_MAX_EDGE)
  })

  it('formatBytes 人类可读', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
