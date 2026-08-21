import { NextResponse } from 'next/server'
import { hasCapability, type CapabilityKey } from './modules/space/permissions'

/**
 * 写接口角色校验（3.6 后台能力模块化）：
 * 无能力时返回 403 响应，否则返回 null。用法：
 *   const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
 *   if (denied) return denied
 */
export async function requireCapability(
  userId: number | null | undefined,
  capability: CapabilityKey,
): Promise<NextResponse | null> {
  if (!userId || !(await hasCapability(userId, capability))) {
    return NextResponse.json({ error: '当前角色无权执行该操作' }, { status: 403 })
  }
  return null
}
