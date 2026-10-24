/**
 * 应用内导航栈（2026-10-12 新增）
 *
 * 目的：给 `goBackOrHome` 一个**可信的**"有没有上一页"判据。
 *
 * 为什么不能用 `window.history.length`：
 *   · 浏览器里它包含本站之外的条目（用户从搜索引擎进来时 >1 但没有本站上一页）；
 *   · **Capacitor WebView 里它恒 >1**（WebView 自带初始项），于是 back() 会退到
 *     空白历史项 → 真机表现为"侧滑返回直接退出 App 回到桌面"。
 *
 * 这里维护一个只含本站路径的栈：
 *   · pathname 变化时，若新路径 === 栈顶的**上一层**，判为返回 → pop；
 *   · 否则判为前进 → push。
 * 模块级单例，跨页面存活，不触发 React 重渲染（返回值只在事件回调里读取）。
 *
 * 边界：
 *   · 栈空时 push 首个路径（保证 len>=1）；
 *   · 同一路径重复 push 不叠加（避免 replace/刷新造成的虚假深度）；
 *   · 上限 50，防止长时间使用无限增长。
 */
const MAX_DEPTH = 50
let stack: string[] = []

function normalize(path: string): string {
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '')
  return clean || '/'
}

/** 尝试按"返回"解释本次变化；成功则返回 true */
export function recordPop(pathname: string): boolean {
  const next = normalize(pathname)
  if (stack.length >= 2 && stack[stack.length - 2] === next) {
    stack.pop()
    return true
  }
  return false
}

/** 按"前进"记录本次变化 */
export function recordPush(pathname: string): void {
  const next = normalize(pathname)
  if (stack[stack.length - 1] === next) return
  stack.push(next)
  if (stack.length > MAX_DEPTH) stack = stack.slice(-MAX_DEPTH)
}

/** 是否存在**应用内**的上一页（决定 back() 是否安全） */
export function canGoBackInApp(): boolean {
  return stack.length > 1
}

/**
 * 以 replace 方式到达 pathname 时校正栈（goBackOrHome 的深链兜底专用）。
 *
 * replace 不新增浏览器历史项，但随后的 pathname 变化仍会经 trackNavigation
 * 走 recordPush —— 若不在这里把栈重置为 [pathname]，栈会留下
 * [深链页, fallback] 的假深度，返回键判定"有上一页"后 back() 到的却是
 * 已被替换掉的深链历史项（表现为"返回后又弹回详情页"）。
 * 校正后 trackNavigation 对同路径重复 push 不叠加，栈保持诚实。
 */
export function replaceCurrent(pathname: string): void {
  stack = [normalize(pathname)]
}

/** 仅用于测试/调试 */
export function __getStack(): string[] {
  return stack.slice()
}

export function __resetStack(initial?: string): void {
  stack = initial ? [normalize(initial)] : []
}
