import { describe, it, expect, afterEach } from 'vitest'
import { findBannedWord, findExternalLinks, checkContent } from '@/lib/modules/content/policy'

/** P3-39：内容策略（反垃圾/敏感词/外链）是纯函数，此前无直接单测。 */
afterEach(() => {
  delete process.env.CONTENT_BANNED_WORDS
})

describe('findBannedWord', () => {
  it('空内容返回 null', () => {
    expect(findBannedWord('')).toBeNull()
    expect(findBannedWord(undefined as unknown as string)).toBeNull()
  })

  it('命中内置敏感词并返回该词', () => {
    expect(findBannedWord('来玩博彩吧')).toBe('博彩')
    expect(findBannedWord('这是正常的旅行记录')).toBeNull()
  })

  it('支持 CONTENT_BANNED_WORDS 扩展并去重', () => {
    process.env.CONTENT_BANNED_WORDS = ' 代刷 , 刷单 ,违规词 '
    expect(findBannedWord('提供代刷服务')).toBe('代刷')
    expect(findBannedWord('刷单')).toBe('刷单')
  })
})

describe('findExternalLinks', () => {
  it('空内容返回空数组', () => {
    expect(findExternalLinks('')).toEqual([])
  })

  it('提取 http/https/www 链接并去重', () => {
    const links = findExternalLinks('看 https://a.com/x 和 www.b.cn 以及 https://a.com/x')
    expect(links).toEqual(['https://a.com/x', 'www.b.cn'])
  })

  it('普通文本没有链接', () => {
    expect(findExternalLinks('今天去了京都')).toEqual([])
  })
})

describe('checkContent', () => {
  it('空白内容被拒', () => {
    expect(checkContent('   ')).toEqual({ ok: false, reason: '内容不能为空' })
  })

  it('超长内容被拒（默认上限 2000）', () => {
    const res = checkContent('好'.repeat(2001))
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('2000')
  })

  it('自定义长度上限生效', () => {
    const res = checkContent('一二三四五六', { maxLength: 5 })
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('5')
  })

  it('敏感词被拒并回传命中词', () => {
    const res = checkContent('出售色情内容')
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('色情')
  })

  it('外链数量超限被拒；maxLinks=0 时禁止任何链接', () => {
    const many = 'a https://1.com b https://2.com c https://3.com d https://4.com'
    expect(checkContent(many)).toEqual({ ok: false, reason: '内容链接过多（最多 3 条）' })
    expect(checkContent('见 https://x.com', { maxLinks: 0 })).toEqual({ ok: false, reason: '内容不允许包含链接' })
  })

  it('合法短内容通过', () => {
    expect(checkContent('今天在大理看洱海')).toEqual({ ok: true })
  })
})
