import { describe, it, expect } from 'vitest'
import {
  isValidUploadId,
  totalChunksFor,
  variantFilenameFor,
  resumeStorageKey,
  RESUMABLE_CHUNK_SIZE,
} from '@/lib/infrastructure/video-upload-shared'

describe('视频断点续传共享纯函数', () => {
  it('isValidUploadId 只接受 UUID 形态（防路径穿越）', () => {
    expect(isValidUploadId('a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBe(true)
    expect(isValidUploadId('../../etc/passwd')).toBe(false)
    expect(isValidUploadId('..\\..\\win.ini')).toBe(false)
    expect(isValidUploadId('/absolute/path')).toBe(false)
    expect(isValidUploadId('uuid-with-%2e%2e')).toBe(false)
    expect(isValidUploadId('')).toBe(false)
    expect(isValidUploadId(undefined)).toBe(false)
    expect(isValidUploadId(123)).toBe(false)
    expect(isValidUploadId('a1b2c3d4e5f67890abcdef0123456789')).toBe(false)
  })

  it('totalChunksFor 向上取整', () => {
    expect(totalChunksFor(0 + 1)).toBe(1)
    expect(totalChunksFor(RESUMABLE_CHUNK_SIZE)).toBe(1)
    expect(totalChunksFor(RESUMABLE_CHUNK_SIZE + 1)).toBe(2)
    expect(totalChunksFor(500 * 1024 * 1024)).toBe(100)
  })

  it('variantFilenameFor 生成 -720.mp4 变体名', () => {
    expect(variantFilenameFor('trip.mp4')).toBe('trip-720.mp4')
    expect(variantFilenameFor('trip.webm')).toBe('trip-720.mp4')
    expect(variantFilenameFor('我的.旅行.mp4')).toBe('我的.旅行-720.mp4')
    expect(variantFilenameFor('noext')).toBe('noext-720.mp4')
    // 不允许目录逃逸式输入影响命名（调用侧还有 basename 防御，这里只管命名规则）
    expect(variantFilenameFor('../x.mp4')).toBe('../x-720.mp4')
  })

  it('resumeStorageKey 按指纹区分', () => {
    expect(resumeStorageKey('a.mp4:1:2')).toBe('tn-vupload:a.mp4:1:2')
    expect(resumeStorageKey('a.mp4:2:2')).not.toBe(resumeStorageKey('a.mp4:1:2'))
  })
})
