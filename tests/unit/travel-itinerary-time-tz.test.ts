import { describe, it, expect } from 'vitest'
import { formatTime } from '@/components/travel/detail/format'

/**
 * 行程时间的时区语义（2026-10-17）
 *
 * 行程起止时间是**墙上时间**（行程表上的 17:00），不是时间点。
 * 服务端 parseTimeOrDate 用 Date.UTC 写入，客户端 formatTime 必须用 getUTC* 读回，
 * 否则服务端时区（容器 TZ=UTC）与设备时区（UTC+8）不一致时整体平移：
 * 选 17:00 会显示成次日 01:00 —— 真机反馈「选下午5点到晚上9点，变成凌晨1点到5点」。
 */
describe('formatTime · 行程时间按墙上时间渲染', () => {
  it('UTC 字段即墙上时间：17:00Z 显示 17:00（不受设备时区影响）', () => {
    // 服务端写入 17:00 → Date.UTC(1970,0,1,17,0,0) → '1970-01-01T17:00:00.000Z'
    expect(formatTime('1970-01-01T17:00:00.000Z')).toBe('17:00')
  })

  it('21:00 不会被平移成 05:00', () => {
    expect(formatTime('1970-01-01T21:00:00.000Z')).toBe('21:00')
  })

  it('历史数据同样正确：库里存的 16:50Z 就是当初写入的 16:50', () => {
    expect(formatTime('2026-10-13T16:50:00.000Z')).toBe('16:50')
    expect(formatTime('2026-10-13T20:30:00.000Z')).toBe('20:30')
  })

  it('已经是 HH:mm 的纯时间串原样返回', () => {
    expect(formatTime('17:00')).toBe('17:00')
    expect(formatTime('17:00:00')).toBe('17:00')
  })

  it('空值返回空串', () => {
    expect(formatTime(null)).toBe('')
    expect(formatTime(undefined)).toBe('')
    expect(formatTime('')).toBe('')
  })
})
