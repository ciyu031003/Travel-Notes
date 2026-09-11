import { describe, it, expect } from 'vitest'
import { albumDeepLink, readBookKeyFromUrl } from '@/lib/album-deep-link'

describe('albumDeepLink', () => {
  it('构造 /album?book=<编码后的 key>', () => {
    expect(albumDeepLink('hangzhou-2024')).toBe('/album?book=hangzhou-2024')
    expect(albumDeepLink('北京&西安')).toBe(
      '/album?book=' + encodeURIComponent('北京&西安'),
    )
  })
})

describe('readBookKeyFromUrl', () => {
  it('解析 ?book= 参数', () => {
    expect(readBookKeyFromUrl('/album?book=hangzhou-2024')).toBe('hangzhou-2024')
    expect(readBookKeyFromUrl('/album?book=hangzhou-2024&page=2')).toBe('hangzhou-2024')
    const encoded = encodeURIComponent('北京&西安')
    expect(readBookKeyFromUrl(`/album?book=${encoded}`)).toBe('北京&西安')
  })

  it('无参数/空输入返回 null', () => {
    expect(readBookKeyFromUrl('')).toBeNull()
    expect(readBookKeyFromUrl('/album')).toBeNull()
    expect(readBookKeyFromUrl('/album?page=2')).toBeNull()
  })

  it('URLSearchParams 构造失败时返回 null', () => {
    expect(readBookKeyFromUrl('\u0000')).toBeNull()
  })
})
