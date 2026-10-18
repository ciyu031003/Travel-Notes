'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 出错时替换的内容；不传则用内置降级卡（深色相册场景可读） */
  fallback?: ReactNode
  /** 定位用的标签，打印到 console 便于排查是哪块渲染器失败 */
  label?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

/**
 * 渲染级错误边界（P1-20 / U-1）
 * ============================================================================
 * 背景：全仓此前 0 个 ErrorBoundary/componentDidCatch —— 只要某个 WebGL/Canvas
 * 渲染器在渲染期抛错（上下文丢失、几何数据异常、数组越界），React 会卸载整棵树，
 * 用户看到浏览器英文白屏且无法恢复（移动端 WebView 更糟）。
 *
 * 落点：app/album/page.tsx 的 4 个 dynamic 渲染器（银河/照片墙/星图/形变查看器）
 * 用本组件包住 —— 单个渲染器失败只降级为一块静态提示，页面其余部分照常可浏览。
 *
 * 为什么是 class：React 的错误边界目前只有 class 的 componentDidCatch /
 * getDerivedStateFromError 能做，函数组件没有等价 API。
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error ?? ''),
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 必须留日志：降级后用户只看到一句提示，排查只能靠这里（含组件栈）。
    console.error(
      `[ErrorBoundary${this.props.label ? ':' + this.props.label : ''}] 渲染失败:`,
      error,
      info?.componentStack,
    )
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div
        role="alert"
        className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-6 text-center"
      >
        <p className="text-sm font-medium text-white/85">这部分内容暂时无法显示</p>
        <p className="max-w-sm text-xs leading-relaxed text-white/50">
          渲染器遇到了问题，页面其它内容不受影响。可以点下方重试，或继续浏览。
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs text-white/85 transition-colors hover:bg-white/20"
        >
          重试
        </button>
      </div>
    )
  }
}
