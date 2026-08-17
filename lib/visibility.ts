/**
 * 内容可见性辅助：多用户模式下，用户只能看到「自己的内容 + 公开内容」。
 * - userId 为空（未登录/构建期）：只返回公开内容
 * - userId 存在：返回 userId 归属 或 isPublic=true 的内容
 */
export function scopedWhere(
  userId: number | null | undefined,
  field: string = 'userId'
): Record<string, unknown> {
  // undefined = 未传入，调用方自行决定（保持旧行为：不限制）
  if (userId === undefined) return {}
  if (!userId) {
    return { isPublic: true }
  }
  return {
    OR: [{ [field]: userId }, { isPublic: true }],
  }
}
