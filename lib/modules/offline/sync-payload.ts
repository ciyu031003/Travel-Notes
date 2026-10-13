/** 兼容历史双重 JSON 编码的队列快照；新入队调用方必须传对象。 */
export function decodeSyncPayload(raw: string | null | undefined): Record<string, unknown> {
  let value: unknown = raw ? JSON.parse(raw) : {}
  if (typeof value === 'string') value = JSON.parse(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效同步数据')
  return value as Record<string, unknown>
}
