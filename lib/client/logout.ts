/**
 * 客户端退出登录的唯一入口（M-1 / P1-22 收口）。
 *
 * 为什么必须是共享函数而不是各页面手写：登出在 App 里不是"清 Cookie"一件事——
 * 本地 SQLite 是全局单库，待同步队列还会带着下一个账号的 Cookie 上传。设置页
 * 已按正确顺序清理，但「我的」tab 抽屉的退出入口曾长期是裸 fetch + push：
 * 引擎继续每 30s 回放队列 → 无 Cookie 的请求全部 401 → 4xx 规则把**尚未上传的
 * 离线创作批量打成 DEAD**（用户内容永久丢失）。任何新增的登出入口都必须走这里。
 *
 * 顺序刻意如此：**先清本地，再注销会话**（清库步骤不再需要 Cookie）。
 * 每一步都包 try/catch：本地存储异常（插件坏、磁盘满）不能把用户困在登录态里。
 */
import { apiUrl } from '@/lib/api-base'
import { stopSyncEngine } from '@/lib/modules/offline/bootstrap'
import { purgeOfflineForLogout } from '@/lib/modules/offline/reset'
import { resetAccountScopeCache } from '@/lib/modules/offline/account-scope'
import { clearPersistedCache } from '@/lib/client/persisted-cache'
import { __resetUseApiSnapshots } from '@/lib/client/use-api'

export async function performLogout(): Promise<void> {
  try {
    stopSyncEngine()
  } catch {}
  try {
    await purgeOfflineForLogout()
  } catch {}
  try {
    resetAccountScopeCache()
  } catch {}
  /**
   * 本地优先水合（2026-11-23）引入的快照层必须跟着退出登录一起清：
   *  · 隐私：换账号后新用户会先看到上一个账号的首页/旅程/相册内容（≤1 个 RTT）；
   *  · 正确性：内存快照同样要清，否则 useEffect 首帧会拿旧数据渲染。
   * 放在清库之后、注销会话之前（顺序无关，但都不需要 Cookie）。
   */
  try {
    clearPersistedCache()
    __resetUseApiSnapshots()
  } catch {}
  try {
    await fetch(apiUrl('/api/logout'), { method: 'POST', credentials: 'include' })
  } catch {}
}
