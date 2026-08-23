/**
 * v3.1 M3-B3：内容策略（反垃圾/敏感词统一入口）。
 * 提供：
 * - 敏感词检测（内置基础列表 + 可经 env CONTENT_BANNED_WORDS 扩展，逗号分隔）
 * - URL 过滤（评论/标题中批量外链检测，反推广垃圾）
 * - 内容校验（长度/空白），供评论、碎碎念、旅行标题等写入路径统一调用
 */
const DEFAULT_BANNED_WORDS = [
  // 基础违规词（占位；生产建议接入敏感词服务或扩充列表）
  '赌博', '博彩', '代开发票', '办证', '刷单', '色情', '援交', '裸聊',
]

function loadBannedWords(): string[] {
  const extra = (process.env.CONTENT_BANNED_WORDS || '').split(',').map((s) => s.trim()).filter(Boolean)
  return Array.from(new Set([...DEFAULT_BANNED_WORDS, ...extra]))
}

/** 检测是否含敏感词，返回命中词（无则 null） */
export function findBannedWord(text: string): string | null {
  if (!text) return null
  const t = String(text)
  for (const w of loadBannedWords()) {
    if (w && t.includes(w)) return w
  }
  return null
}

const URL_RE = /(https?:\/\/|www\.)[^\s"'<>]+/gi

/** 检测内容中的外链数量（推广垃圾常见特征）；返回外链数组 */
export function findExternalLinks(text: string): string[] {
  if (!text) return []
  const m = String(text).match(URL_RE)
  return m ? Array.from(new Set(m)) : []
}

/** 内容校验结果 */
export interface ContentCheckResult {
  ok: boolean
  reason?: string
}

/** 统一内容校验：长度 + 敏感词 + 外链限制（maxLinks=0 禁止外链） */
export function checkContent(
  text: string,
  opts: { maxLength?: number; minLength?: number; maxLinks?: number } = {},
): ContentCheckResult {
  const t = String(text || '')
  const { maxLength = 2000, minLength = 1, maxLinks = 3 } = opts
  if (t.trim().length < minLength) return { ok: false, reason: '内容不能为空' }
  if (t.length > maxLength) return { ok: false, reason: `内容最多 ${maxLength} 字` }

  const banned = findBannedWord(t)
  if (banned) return { ok: false, reason: `内容包含违规词汇「${banned}」` }

  const links = findExternalLinks(t)
  if (maxLinks === 0 && links.length > 0) return { ok: false, reason: '内容不允许包含链接' }
  if (links.length > maxLinks) return { ok: false, reason: `内容链接过多（最多 ${maxLinks} 条）` }

  return { ok: true }
}
