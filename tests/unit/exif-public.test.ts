import { describe, it, expect } from 'vitest'
import { toPublicExif } from '@/lib/exif'

/**
 * P0-4：/api/images/[id]/meta 只允许下发白名单字段（S-5）。
 *
 * GPS、设备/镜头序列号这类字段一旦随 /meta 下发，等于公开「这张照片在哪拍的、
 * 用什么机器拍的」。白名单而不是黑名单：新 EXIF 标签每年都在加，黑名单必漏。
 */
describe('toPublicExif 白名单', () => {
  it('只保留宽高 / 方向 / 拍摄时间，丢弃相机型号与曝光参数', () => {
    const publicExif = toPublicExif({
      width: 1600,
      height: 1067,
      orientation: 6,
      dateTaken: '2026-05-01 12:30:00',
      make: 'Apple',
      model: 'iPhone 16 Pro',
      fNumber: 1.8,
      exposureTime: '1/120s',
      iso: 100,
      focalLength: 24,
    })
    expect(publicExif).toEqual({
      width: 1600,
      height: 1067,
      orientation: 6,
      dateTaken: '2026-05-01 12:30:00',
    })
    expect(publicExif).not.toHaveProperty('make')
    expect(publicExif).not.toHaveProperty('model')
  })

  it('即使有人往 ExifData 里塞 GPS/序列号，也不会被带出去', () => {
    const dirty: any = {
      width: 800,
      height: 600,
      latitude: 31.2304,
      longitude: 121.4737,
      altitude: 4,
      GPSLatitude: '31/1,13/1,49/1',
      bodySerialNumber: 'SN123456',
    }
    const publicExif = toPublicExif(dirty)
    expect(publicExif).toEqual({ width: 800, height: 600 })
    const serialized = JSON.stringify(publicExif)
    expect(serialized).not.toContain('31.2304')
    expect(serialized).not.toContain('SN123456')
  })

  it('方向越界（非 1-8）/ 尺寸非正 → 丢弃该字段', () => {
    expect(toPublicExif({ width: 0, height: -5, orientation: 99 })).toBeNull()
  })

  it('没有可返回字段时返回 null（前端按无 EXIF 处理）', () => {
    expect(toPublicExif(null)).toBeNull()
    expect(toPublicExif({ make: 'Apple' })).toBeNull()
  })
})
