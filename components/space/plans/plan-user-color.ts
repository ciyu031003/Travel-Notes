/** 用户配色槽位（0..5）：awareness 里只传槽位号，颜色由 CSS 的 [data-slot] 决定 */
export function userSlot(id?: number | null, key?: string | null): number {
  const source = id != null && id > 0 ? `u${id}` : String(key ?? '')
  let hash = 0
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 100000
  }
  return Math.abs(hash) % 6
}

/** 头像/光标上的展示名（昵称优先） */
export function displayName(user: { nickname?: string | null; username?: string | null } | null | undefined): string {
  if (!user) return '有人'
  return user.nickname || user.username || '有人'
}
