/**
 * 应用内返回的统一入口。
 *
 * 为什么要收敛：二级页的返回按钮此前各自手写 `router.back()`，
 * 深链进入（通知 / 分享链接 / 收藏夹）时历史栈里没有本站上一页，
 * back() 会把用户退出站点或什么都不做。旅行详情壳与移动端 LargeTitle
 * 各自写过 `history.length > 1` 判断，行为一致但实现重复——
 * 这里收敛为单一实现，所有返回按钮/侧滑返回统一走它。
 */
export interface BackCapableRouter {
  back: () => void
  push: (href: string) => void
}

/** 有可回退历史则 back()，否则去 fallback（深链进入时 back() 会离开站点）。 */
export function goBackOrHome(router: BackCapableRouter, fallback = '/'): void {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
  } else {
    router.push(fallback)
  }
}
