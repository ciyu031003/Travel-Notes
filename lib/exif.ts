// 极简 JPEG EXIF 解析器（无第三方依赖，2C2G 友好）
// 提取相机品牌/型号/光圈/快门/ISO/焦距/拍摄时间等常用字段

export interface ExifData {
  make?: string
  model?: string
  fNumber?: number
  exposureTime?: string
  iso?: number
  focalLength?: number
  dateTaken?: string
  width?: number
  height?: number
}


const EXIF_TAG_NAMES: Record<number, string> = {
  0x829a: 'exposureTime',
  0x829d: 'fNumber',
  0x8827: 'iso',
  0x920a: 'focalLength',
  0x9003: 'dateTaken',
  0x0132: 'dateTaken',
}

interface IfdEntry {
  tag: number
  type: number
  count: number
  valueOffset: number
}

function readAscii(data: Buffer, offset: number, count: number): string {
  const end = Math.min(offset + count, data.length)
  return data.toString('ascii', offset, end).replace(/\0+$/g, '').trim()
}

function parseIfd(
  data: Buffer,
  ifdOffset: number,
  byteOrder: 'II' | 'MM',
  tagMap: Record<number, string>
): Record<string, unknown> {
  const little = byteOrder === 'II'
  const result: Record<string, unknown> = {}

  const numEntries = little
    ? data.readUInt16LE(ifdOffset)
    : data.readUInt16BE(ifdOffset)

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + 2 + i * 12
    if (entryOffset + 12 > data.length) break

    const tag = little
      ? data.readUInt16LE(entryOffset)
      : data.readUInt16BE(entryOffset)
    const type = little
      ? data.readUInt16LE(entryOffset + 2)
      : data.readUInt16BE(entryOffset + 2)
    const count = little
      ? data.readUInt32LE(entryOffset + 4)
      : data.readUInt32BE(entryOffset + 4)

    const fieldName = tagMap[tag]
    if (!fieldName) continue

    const valueOffset = entryOffset + 8
    const byteSize = (() => {
      switch (type) {
        case 1: case 2: case 6: case 7: return 1
        case 3: return 2
        case 4: case 9: return 4
        case 5: case 10: return 8
        default: return 1
      }
    })()

    const dataOffset =
      byteSize * count <= 4
        ? valueOffset
        : little
          ? data.readUInt32LE(valueOffset)
          : data.readUInt32BE(valueOffset)

    if (dataOffset + byteSize * count > data.length) continue

    if (type === 2) {
      result[fieldName] = readAscii(data, dataOffset, count)
    } else if (type === 5 || type === 10) {
      // 有理数（分子/分母）
      const num = little
        ? data.readUInt32LE(dataOffset)
        : data.readUInt32BE(dataOffset)
      const den = little
        ? data.readUInt32LE(dataOffset + 4)
        : data.readUInt32BE(dataOffset + 4)
      result[fieldName] = den !== 0 ? num / den : 0
    } else if (type === 3) {
      result[fieldName] = little
        ? data.readUInt16LE(dataOffset)
        : data.readUInt16BE(dataOffset)
    } else if (type === 4 || type === 9) {
      result[fieldName] = little
        ? data.readUInt32LE(dataOffset)
        : data.readUInt32BE(dataOffset)
    } else if (type === 1) {
      result[fieldName] = data[dataOffset]
    }
  }

  return result
}

function formatExposureTime(value: number): string {
  if (!value || value <= 0) return ''
  if (value >= 1) return `${Math.round(value)}s`
  return `1/${Math.round(1 / value)}s`
}

function formatDateTaken(value: string): string {
  // EXIF 日期格式: "2024:05:01 12:30:00"
  if (!value) return ''
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ ](\d{2}):(\d{2}):(\d{2})/)
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
  }
  return value
}

/** 从 JPEG 二进制解析 EXIF；非 JPEG 或无 EXIF 返回 null */
export function parseExif(buffer: Buffer): ExifData | null {
  if (!buffer || buffer.length < 4) return null
  // JPEG SOI 检查
  if (!(buffer[0] === 0xff && buffer[1] === 0xd8)) {
    // WebP: RIFF....WEBP
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return parseWebpExif(buffer)
    }
    return null
  }

  let offset = 2
  const width = readJpegDimensions(buffer)
  let exifOffset = -1

  // 遍历 JPEG 段，查找 APP1 (0xFFE1) 且包含 "Exif\0\0"
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buffer[offset + 1]
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const segLen = buffer.readUInt16BE(offset + 2)
    if (segLen < 2) break
    if (marker === 0xe1 && segLen >= 10) {
      const app1Start = offset + 4
      if (buffer.toString('ascii', app1Start, app1Start + 6) === 'Exif\x00\x00') {
        exifOffset = app1Start + 6
        break
      }
    }
    offset += 2 + segLen
  }

  if (exifOffset < 0 || exifOffset + 8 > buffer.length) {
    return width ? { width: width.width, height: width.height } : null
  }

  const byteOrder = buffer.toString('ascii', exifOffset, exifOffset + 2)
  if (byteOrder !== 'II' && byteOrder !== 'MM') {
    return width ? { width: width.width, height: width.height } : null
  }
  const little = byteOrder === 'II'

  const ifd0Offset =
    exifOffset +
    (little ? buffer.readUInt32LE(exifOffset + 4) : buffer.readUInt32BE(exifOffset + 4))

  const ifd0 = parseIfd(buffer, ifd0Offset, byteOrder, {
    0x010f: 'make',
    0x0110: 'model',
  })

  const exifIfdPointer = little
    ? buffer.readUInt32LE(ifd0Offset + 8)
    : buffer.readUInt32BE(ifd0Offset + 8)
  const exifIfd = exifIfdPointer
    ? parseIfd(buffer, exifOffset + exifIfdPointer, byteOrder, EXIF_TAG_NAMES)
    : {}

  const result: ExifData = {
    ...(width || {}),
    make: (ifd0.make as string) || undefined,
    model: (ifd0.model as string) || undefined,
  }

  if (exifIfd.fNumber !== undefined) result.fNumber = Number(exifIfd.fNumber) || undefined
  if (exifIfd.exposureTime !== undefined) {
    const t = formatExposureTime(Number(exifIfd.exposureTime))
    if (t) result.exposureTime = t
  }
  if (exifIfd.iso !== undefined) result.iso = Number(exifIfd.iso) || undefined
  if (exifIfd.focalLength !== undefined) result.focalLength = Number(exifIfd.focalLength) || undefined
  if (exifIfd.dateTaken !== undefined) {
    const d = formatDateTaken(String(exifIfd.dateTaken))
    if (d) result.dateTaken = d
  }

  return result
}

function parseWebpExif(buffer: Buffer): ExifData | null {
  // WebP EXIF 存放于 'EXIF' chunk（可能带 "Exif\0\0" 前缀）
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    if (chunkId === 'EXIF' && dataStart + chunkSize <= buffer.length) {
      let exifOffset = dataStart
      if (buffer.toString('ascii', dataStart, dataStart + 6) === 'Exif\x00\x00') {
        exifOffset = dataStart + 6
      }
      const byteOrder = buffer.toString('ascii', exifOffset, exifOffset + 2)
      if (byteOrder === 'II' || byteOrder === 'MM') {
        const little = byteOrder === 'II'
        const ifd0Offset =
          exifOffset +
          (little ? buffer.readUInt32LE(exifOffset + 4) : buffer.readUInt32BE(exifOffset + 4))
        const ifd0 = parseIfd(buffer, ifd0Offset, byteOrder, {
          0x010f: 'make',
          0x0110: 'model',
        })
        const exifIfdPointer = little
          ? buffer.readUInt32LE(ifd0Offset + 8)
          : buffer.readUInt32BE(ifd0Offset + 8)
        const exifIfd = exifIfdPointer
          ? parseIfd(buffer, exifOffset + exifIfdPointer, byteOrder, EXIF_TAG_NAMES)
          : {}
        const result: ExifData = {
          make: (ifd0.make as string) || undefined,
          model: (ifd0.model as string) || undefined,
        }
        if (exifIfd.fNumber !== undefined) result.fNumber = Number(exifIfd.fNumber) || undefined
        if (exifIfd.exposureTime !== undefined) {
          const t = formatExposureTime(Number(exifIfd.exposureTime))
          if (t) result.exposureTime = t
        }
        if (exifIfd.iso !== undefined) result.iso = Number(exifIfd.iso) || undefined
        if (exifIfd.focalLength !== undefined) result.focalLength = Number(exifIfd.focalLength) || undefined
        if (exifIfd.dateTaken !== undefined) {
          const d = formatDateTaken(String(exifIfd.dateTaken))
          if (d) result.dateTaken = d
        }
        return result
      }
    }
    offset = dataStart + chunkSize + (chunkSize % 2)
  }
  return null
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buffer[offset + 1]
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const segLen = buffer.readUInt16BE(offset + 2)
    if (segLen < 2) break
    // SOF0-SOF15（排除 DHT C4 / DAC CC / RST / SOI / EOI）
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buffer.readUInt16BE(offset + 5)
      const width = buffer.readUInt16BE(offset + 7)
      return { width, height }
    }
    offset += 2 + segLen
  }
  return null
}

