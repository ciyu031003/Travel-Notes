'use client'

import { useEffect } from 'react'
// global-error 会替换整个 root layout，root layout 里的全局样式不会自动生效；
// 显式再引一次 globals.css（Next 会去重），这样下面的 var(--semantic-*) 才拿得到值。
import './globals.css'

/**
 * 根布局级错误兜底（P1-20 / U-1）
 * ============================================================================
 * global-error.tsx 会**替换整个 root layout**（拿不到 root layout 的 DOM 结构与组件），
 * 所以这里必须自带 html/body。颜色一律引用 semantic token 的 CSS 变量
 * （var(--x, 具名色) 带兜底），不直接写 hex/rgba —— 既跟随双主题，也过设计 token 门禁。
 * 触发场景：root layout 本身或根段渲染抛错；普通页面错误由 app/error.tsx 处理。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/global-error] 根布局渲染失败:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          background: 'var(--semantic-bg, white)',
          color: 'var(--semantic-text, black)',
        }}
      >
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              background: 'var(--semantic-surface, white)',
              border: '1px solid var(--semantic-line, lightgray)',
              borderRadius: '24px',
              padding: '32px 24px',
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
            }}
          >
            <p style={{ fontSize: '13px', letterSpacing: '0.2em', color: 'var(--semantic-accent, sienna)', margin: 0 }}>
              TIANTU
            </p>
            <h1 style={{ fontSize: '18px', margin: '12px 0 8px', color: 'var(--semantic-heading, black)' }}>
              应用启动时出了点问题
            </h1>
            <p style={{ fontSize: '14px', lineHeight: 1.7, margin: 0, color: 'var(--semantic-text, black)' }}>
              刷新页面通常可以恢复。如果反复出现，请稍后再试。
            </p>
            {error?.digest ? (
              <p style={{ fontSize: '12px', color: 'var(--semantic-muted, gray)', marginTop: '10px' }}>
                错误编号：{error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: '20px',
                border: 0,
                borderRadius: '999px',
                background: 'var(--semantic-accent, sienna)',
                color: 'var(--semantic-on-accent, white)',
                fontSize: '14px',
                padding: '10px 24px',
                cursor: 'pointer',
              }}
            >
              重新加载
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
