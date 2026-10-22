import { describe, it, expect } from 'vitest'
import { parseExif } from '@/lib/exif'

/**
 * P3-36：lib/exif.ts 的 parseExif（EXIF 元数据解析）此前完全没有直接单测
 * （已有 image-dimensions.test.ts 覆盖 readImageDimensions、exif-public.test.ts 覆盖白名单）。
 *
 * 全部用「手工构造的最小二进制 buffer」，不依赖真实照片/第三方库。
 *
 * 注意：当前解析器读取 ExifIFD 指针的偏移约定是「TIFF 起始 + 16」（见 lib/exif.ts
 * 的 readUInt32LE(ifd0Offset + 8)，其中 ifd0Offset = TIFF + 8），并非标准 TIFF 的 0x8769 标签。
 * 本测试按实现的实际布局构造 fixture（不修改业务源码，只锁当前行为）；
 * 若未来修正为标准解析，需要同步替换这里的 fixture 构造器。
 */

function segment(marker: number, payload: Buffer): Buffer {
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2)
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload])
}

function sofPayload(width: number, height: number): Buffer {
  const b = Buffer.alloc(15)
  b[0] = 8
  b.writeUInt16BE(height, 1)
  b.writeUInt16BE(width, 3)
  b[5] = 3
  for (let i = 0; i < 3; i++) {
    b[6 + i * 3] = i + 1
    b[7 + i * 3] = 0x11
    b[8 + i * 3] = 0
  }
  return b
}

function jpeg(width = 800, height = 600, extra: Buffer[] = []): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...extra,
    segment(0xc0, sofPayload(width, height)),
    Buffer.from([0xff, 0xd9]),
  ])
}

interface ExifFields {
  little?: boolean
  fNumber?: [number, number]
  exposureTime?: [number, number]
  iso?: number
  focalLength?: [number, number]
  dateTaken?: string
}

/**
 * 构造解析器可读的 TIFF。
 *
 * 关键点（当前实现的读写约定，见 lib/exif.ts parseIfd）：
 *  - ExifIFD 指针从 TIFF+16 读取（不是标准 0x8769 标签）；
 *  - 变长字段（ASCII/rational）的 value 被当作「整个图片 buffer 的绝对下标」使用，
 *    因此构造时必须传入 TIFF 在图片中的绝对起始位置 tiffStart，把值写成 tiffStart + 相对偏移。
 * 本测试锁当前行为，不修改业务源码。
 */
function buildTiff(fields: ExifFields, tiffStart: number): Buffer {
  const little = fields.little !== false
  const w16 = (b: Buffer, v: number, o: number) => (little ? b.writeUInt16LE(v, o) : b.writeUInt16BE(v, o))
  const w32 = (b: Buffer, v: number, o: number) => (little ? b.writeUInt32LE(v, o) : b.writeUInt32BE(v, o))

  const EXIF_IFD_OFFSET = 20
  interface Plan { tag: number; type: number; count: number; local: number; pair?: [number, number]; text?: string; iso?: number }
  const plans: Plan[] = []
  let dataSize = 0
  const alloc = (len: number): number => {
    const at = dataSize
    dataSize += len
    return at
  }

  plans.push({ tag: 0x829d, type: 5, count: 1, local: alloc(8), pair: fields.fNumber || [0, 0] })
  plans.push({ tag: 0x829a, type: 5, count: 1, local: alloc(8), pair: fields.exposureTime || [0, 0] })
  if (fields.iso !== undefined) plans.push({ tag: 0x8827, type: 3, count: 1, local: -1, iso: fields.iso })
  plans.push({ tag: 0x920a, type: 5, count: 1, local: alloc(8), pair: fields.focalLength || [0, 0] })
  const dateText = fields.dateTaken ? fields.dateTaken + '\0' : undefined
  if (dateText) plans.push({ tag: 0x9003, type: 2, count: dateText.length, local: alloc(dateText.length), text: dateText })

  const exifIfdSize = 2 + plans.length * 12 + 4
  const dataBase = EXIF_IFD_OFFSET + exifIfdSize
  const buf = Buffer.alloc(Math.max(1024, tiffStart + dataBase + dataSize + 16))

  // TIFF header
  buf.write(little ? 'II' : 'MM', 0, 'ascii')
  w16(buf, 0x2a, 2)
  w32(buf, 8, 4)

  // IFD0：空（count=0）+ next IFD=0
  w16(buf, 0, 8)
  w32(buf, 0, 10)
  // 实现约定的 ExifIFD 指针位置：TIFF + 16（相对 TIFF）
  w32(buf, EXIF_IFD_OFFSET, 16)

  // ExifIFD
  w16(buf, plans.length, EXIF_IFD_OFFSET)
  let p = EXIF_IFD_OFFSET + 2
  for (const e of plans) {
    w16(buf, e.tag, p)
    w16(buf, e.type, p + 2)
    w32(buf, e.count, p + 4)
    if (e.type === 3) {
      // 短整数（≤4 字节）内联在 value 字段
      w16(buf, e.iso!, p + 8)
    } else {
      // 数据本身写在 TIFF 内的相对位置，value 字段里存「整个图片的绝对下标」
      const rel = dataBase + e.local
      if (e.type === 2) {
        buf.write(e.text!, rel, 'ascii')
      } else {
        w32(buf, e.pair![0], rel)
        w32(buf, e.pair![1], rel + 4)
      }
      w32(buf, tiffStart + rel, p + 8)
    }
    p += 12
  }
  w32(buf, 0, p)
  return buf
}

function jpegWithExif(fields: ExifFields & { width?: number; height?: number }): Buffer {
  const app1 = segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), buildTiff(fields, 12)]))
  return jpeg(fields.width ?? 800, fields.height ?? 600, [app1])
}

function webpContainer(chunks: Array<{ id: string; payload: Buffer }>): Buffer {
  const parts: Buffer[] = []
  for (const c of chunks) {
    const size = Buffer.alloc(4)
    size.writeUInt32LE(c.payload.length)
    parts.push(Buffer.from(c.id, 'ascii'), size, c.payload)
    if (c.payload.length % 2 === 1) parts.push(Buffer.alloc(1))
  }
  const body = Buffer.concat(parts)
  const total = Buffer.alloc(4)
  total.writeUInt32LE(body.length + 4)
  return Buffer.concat([Buffer.from('RIFF'), total, Buffer.from('WEBP'), body])
}

describe('parseExif：JPEG EXIF 元数据解析（LE / BE）', () => {
  it('解析 fNumber / 曝光 / ISO / 焦距 / 拍摄时间 + SOF 尺寸', () => {
    const buf = jpegWithExif({
      little: true,
      width: 800,
      height: 600,
      fNumber: [28, 10],
      exposureTime: [1, 250],
      iso: 100,
      focalLength: [50, 1],
      dateTaken: '2024:05:01 12:30:00',
    })
    const exif = parseExif(buf)!
    expect(exif.width).toBe(800)
    expect(exif.height).toBe(600)
    expect(exif.fNumber).toBeCloseTo(2.8, 5)
    expect(exif.exposureTime).toBe('1/250s')
    expect(exif.iso).toBe(100)
    expect(exif.focalLength).toBe(50)
    expect(exif.dateTaken).toBe('2024-05-01 12:30:00')
  })

  it('曝光 ≥1s 显示 Ns；分母为 0 的 rational 归 0（不产生 Infinity）', () => {
    const exif = parseExif(jpegWithExif({ little: true, exposureTime: [2, 1], fNumber: [0, 0] }))!
    expect(exif.exposureTime).toBe('2s')
    expect(exif.fNumber).toBeUndefined()
  })

  it('dateTaken 非标准格式原样返回；缺失字段保持 undefined', () => {
    const exif = parseExif(jpegWithExif({ little: true, dateTaken: '2024/05/01' }))!
    expect(exif.dateTaken).toBe('2024/05/01')
    expect(exif.iso).toBeUndefined()
    expect(exif.focalLength).toBeUndefined()
    expect(exif.make).toBeUndefined()
  })

  it('大端（MM）TIFF 同样可解析', () => {
    const exif = parseExif(jpegWithExif({ little: false, iso: 200, exposureTime: [1, 60] }))!
    expect(exif.iso).toBe(200)
    expect(exif.exposureTime).toBe('1/60s')
  })
})

describe('parseExif：JPEG 回退与异常分支', () => {
  it('无 APP1 的 JPEG → 只返回宽度/高度', () => {
    const exif = parseExif(jpeg(320, 240))!
    expect(exif.width).toBe(320)
    expect(exif.height).toBe(240)
    expect(exif.fNumber).toBeUndefined()
  })

  it('非 JPEG/WebP（PNG 头）→ null', () => {
    expect(parseExif(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull()
  })

  it('过短 buffer → null', () => {
    expect(parseExif(Buffer.alloc(0))).toBeNull()
    expect(parseExif(Buffer.from([0xff, 0xd8]))).toBeNull()
  })

  it('APP1 前缀不是 Exif → 回退尺寸', () => {
    const exif = parseExif(jpeg(64, 48, [segment(0xe1, Buffer.from('NotExif-data', 'ascii'))]))!
    expect(exif.width).toBe(64)
    expect(exif.height).toBe(48)
  })

  it('TIFF byteOrder 非法 → 回退尺寸', () => {
    const tiff = buildTiff({ little: true, iso: 100 }, 12)
    tiff.write('XX', 0, 'ascii')
    const buf = jpeg(100, 50, [segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]))])
    const exif = parseExif(buf)!
    expect(exif.width).toBe(100)
    expect(exif.height).toBe(50)
    expect(exif.iso).toBeUndefined()
  })

  it('段长度非法（<2）且无 SOF → null', () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01])])
    expect(parseExif(broken)).toBeNull()
  })
})

describe('parseExif：WebP EXIF', () => {
  it('EXIF chunk 带 Exif 前缀时解析字段', () => {
    const tiff = buildTiff({ little: true, iso: 400, exposureTime: [1, 125], dateTaken: '2023:01:02 03:04:05' }, 26)
    const buf = webpContainer([
      { id: 'EXIF', payload: Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]) },
    ])
    const exif = parseExif(buf)!
    expect(exif.iso).toBe(400)
    expect(exif.exposureTime).toBe('1/125s')
    expect(exif.dateTaken).toBe('2023-01-02 03:04:05')
  })

  it('EXIF chunk 无前缀（直接 TIFF）也能解析', () => {
    const tiff = buildTiff({ little: true, iso: 64 }, 20)
    const exif = parseExif(webpContainer([{ id: 'EXIF', payload: tiff }]))!
    expect(exif.iso).toBe(64)
  })

  it('没有 EXIF chunk → null', () => {
    expect(parseExif(webpContainer([{ id: 'VP8 ', payload: Buffer.alloc(10) }]))).toBeNull()
  })

  it('EXIF chunk 内 byteOrder 非法 → 继续遍历 → null', () => {
    const bad = Buffer.from('XXnot-a-tiff', 'ascii')
    expect(parseExif(webpContainer([
      { id: 'EXIF', payload: bad },
      { id: 'JUNK', payload: Buffer.alloc(2) },
    ]))).toBeNull()
  })
})