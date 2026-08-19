import { randomInt } from 'crypto'

/**
 * 账号 8 位 ID 生成规则：
 * - admin 固定 01230821
 * - 设置过纪念日（YYYYMMDD）的用户：两位随机前缀 + 纪念日（如 0020260601）
 * - 其余用户：随机 8 位数字
 */
export function generateAccountIdForUser(
  user: { username: string; anniversaryStart?: string | null },
  used: Set<string> = new Set(),
): string {
  if (user.username === 'admin') return '01230821'

  const date = String(user.anniversaryStart || '').replace(/\D/g, '')
  for (let attempt = 0; attempt < 200; attempt++) {
    let accountId = ''
    if (date.length === 8) {
      const prefix = String(randomInt(0, 100)).padStart(2, '0')
      accountId = prefix + date
    } else {
      accountId = String(randomInt(10000000, 100000000))
    }
    if (!used.has(accountId)) {
      used.add(accountId)
      return accountId
    }
  }

  // 极端兜底：时间戳后 8 位
  return String(Date.now()).slice(-8)
}
