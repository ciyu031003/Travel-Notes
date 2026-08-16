import { describe, it, expect } from 'vitest'
import { unifiedMarkdownRenderer } from '@/lib/infrastructure/markdown'

async function render(md: string): Promise<string> {
  const out = await unifiedMarkdownRenderer.render(md)
  return out.html
}

describe('Markdown XSS 防护（rehype-sanitize）', () => {
  it('剥离 script', async () => {
    const html = await render('<script>alert(1)</script>')
    expect(html).not.toMatch(/<script/i)
  })

  it('剥离事件属性 onerror/onload', async () => {
    const html = await render('<img src=x onerror=alert(1)>')
    expect(html).not.toMatch(/onerror/i)
  })

  it('剥离 javascript: 协议链接', async () => {
    const html = await render('<a href="javascript:alert(1)">click</a>')
    expect(html).not.toMatch(/javascript:/i)
  })

  it('剥离 iframe', async () => {
    const html = await render('<iframe src="https://evil.example"></iframe>')
    expect(html).not.toMatch(/<iframe/i)
  })

  it('剥离 svg 及其 onload', async () => {
    const html = await render('<svg onload=alert(1)><circle/></svg>')
    expect(html).not.toMatch(/<svg/i)
    expect(html).not.toMatch(/onload/i)
  })

  it('剥离 object/embed', async () => {
    const html = await render('<object data="x"></object><embed src="y">')
    expect(html).not.toMatch(/<object/i)
    expect(html).not.toMatch(/<embed/i)
  })

  it('markdown 链接的 javascript: 也会被剥离', async () => {
    const html = await render('[x](javascript:alert(1))')
    expect(html).not.toMatch(/javascript:/i)
  })

  it('data:text/html 的 img src 被剥离', async () => {
    const html = await render('<img src="data:text/html;base64,PHNjcmlwdD4=">')
    expect(html).not.toMatch(/data:text\/html/i)
  })

  it('正常 Markdown（标题/链接/代码块）仍可渲染', async () => {
    const fence = String.fromCharCode(96).repeat(3)
    const md = '# 标题' + String.fromCharCode(10) + String.fromCharCode(10)
      + '[链接](https://example.com)' + String.fromCharCode(10) + String.fromCharCode(10)
      + fence + 'ts' + String.fromCharCode(10) + 'const a = 1' + String.fromCharCode(10) + fence
    const html = await render(md)
    expect(html).toContain('标题')
    expect(html).toContain('example.com')
    expect(html).toContain('language-ts')
  })

  it('KaTeX 数学公式仍可渲染且不破坏 sanitize', async () => {
    const html = await render('公式 $E=mc^2$')
    expect(html).toContain('math')
  })
})
