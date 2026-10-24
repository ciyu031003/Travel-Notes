/**
 * 应用内返回的统一入口。
 *
 * 为什么要收敛：二级页的返回按钮此前各自手写 `router.back()`，
 * 深链进入（通知 / 分享链接 / 收藏夹）时历史栈里没有本站上一页，
 * back() 会把用户退出站点或什么都不做。旅行详情壳与移动端 LargeTitle
 * 各自写过 `history.length > 1` 判断，行为一致但实现重复——
 * 这里收敛为单一实现，所有返回按钮/侧滑返回统一走它。
 *
 * ── 2026-10-12 修复（原生壳「左滑直接退出 App」）────────────────────────────
 * 原实现用 `window.history.length > 1` 判断"有没有上一页"。这在浏览器里成立，
 * 但在 **Capacitor WebView** 里恒为真（WebView 自身会带一条初始历史项），
 * 于是 `router.back()` 会跨越本站历史、退到 WebView 的空白项 ——
 * 真机表现就是"左滑直接回到了手机桌面"。
 *
 * 现在改为**自己维护应用内导航栈**（见 navigation-stack.ts）：
 * 只统计本站内部的 push/pop，栈深度 > 1 才允许 back()，否则走 fallback。
 * 这样无论浏览器还是原生壳，行为一致且永不退出应用。
 */
import { canGoBackInApp, recordPop, recordPush, replaceCurrent } from './navigation-stack'

export interface BackCapableRouter {
  back: () => void
  push: (href: string) => void
  replace: (href: string) => void
}

/**
 * 在一次路由变化时更新应用内栈。由 LayoutContent 统一调用（每次 pathname 变化）。
 * 判定：新路径等于栈中"上一个" → 视为返回（pop）；否则视为前进（push）。
 */
export function trackNavigation(pathname: string): void {
  if (recordPop(pathname)) return
  recordPush(pathname)
}

/** 有可回退历史则 back()，否则去 fallback（深链进入时 back() 会离开站点）。 */
export function goBackOrHome(router: BackCapableRouter, fallback = '/'): void {
  if (typeof window !== 'undefined' && canGoBackInApp()) {
    router.back()
  } else {
    // 必须 replace 而非 push（2026-10-24 修复"深链返回弹跳"）：
    // 深链打开详情页时栈里只有这一页（canGoBackInApp=false），若用 push 去
    // fallback，浏览器历史会变成 [详情, 列表] 且 navigation-stack 深度变 2 ——
    // 用户在列表按返回时 router.back() 又弹回刚离开的详情页，"回不去也退不出"。
    // replace 不新增历史项；同时把应用内栈校正为 [fallback]，否则 trackNavigation
    // 会把这次 replace 记成前进、留下假深度（见 navigation-stack.replaceCurrent）。
    router.replace(fallback)
    replaceCurrent(fallback)
  }
}
