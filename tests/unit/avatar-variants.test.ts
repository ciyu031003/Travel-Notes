import { describe, it, expect } from 'vitest'
import { avatarVariantUrl, avatarFilePaths } from '@/lib/modules/social/avatar-variants'

describe('avatarVariantUrl', () => {
  it('相对主图 URL 推导 preview/blur 变体', () => {
    expect(avatarVariantUrl('/uploads/avatars/avatar-7-1700000000000.webp', 'preview')).toBe(
      '/uploads/avatars/avatar-7-1700000000000-preview.webp',
    )
    expect(avatarVariantUrl('/uploads/avatars/avatar-7-1700000000000.webp', 'blur')).toBe(
      '/uploads/avatars/avatar-7-1700000000000-blur.jpg',
    )
  })

  it('绝对地址（原生壳跨域）同样可推导', () => {
    expect(avatarVariantUrl('https://travel-notes.yuanabd.cn/uploads/avatars/avatar-3-1.webp', 'preview')).toBe(
      'https://travel-notes.yuanabd.cn/uploads/avatars/avatar-3-1-preview.webp',
    )
  })

  it('已是变体/非头像 URL/空值返回 null（不重复拼后缀）', () => {
    expect(avatarVariantUrl('/uploads/avatars/avatar-1-2-preview.webp', 'preview')).toBeNull()
    expect(avatarVariantUrl('/uploads/avatars/avatar-1-2-blur.jpg', 'blur')).toBeNull()
    expect(avatarVariantUrl('/uploads/media/abc.webp', 'preview')).toBeNull()
    expect(avatarVariantUrl(null, 'preview')).toBeNull()
    expect(avatarVariantUrl(undefined, 'blur')).toBeNull()
  })
})

describe('avatarFilePaths', () => {
  it('返回主图+全部变体的相对路径', () => {
    expect(avatarFilePaths('/uploads/avatars/avatar-9-5.webp')).toEqual([
      '/uploads/avatars/avatar-9-5.webp',
      '/uploads/avatars/avatar-9-5-preview.webp',
      '/uploads/avatars/avatar-9-5-blur.jpg',
    ])
  })

  it('非头像 URL 返回空数组', () => {
    expect(avatarFilePaths('/uploads/media/x.webp')).toEqual([])
  })
})
