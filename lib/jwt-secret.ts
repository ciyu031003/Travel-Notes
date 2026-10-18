/**
 * JWT 密钥解析的唯一实现（P1-13 配套）。
 *
 * 为什么必须拒绝占位值：部署模板（docker-compose.yml / .env.example）里的默认值
 * 一旦被直接带到生产，等于把「签名密钥」公开 —— 任何人都能伪造站长会话。
 * 比「非空」更强的校验：
 *   - 拒绝已知占位/示例值（__SET_JWT_SECRET_IN_ENV__、change-me、change-this、
 *     dev-only-insecure-secret 等）；
 *   - 长度 < 32 拒绝（openssl rand -hex 32 生成 64 字符）；
 * 生产环境命中即 throw，让容器**启动失败**（fail-fast 好过静默用弱密钥）；
 * 开发环境只 warn 并允许，避免本地起不来。
 */

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret'

/** 已知占位/示例值：命中任意一条即视为「没有配置真正的密钥」 */
const PLACEHOLDER_RE = /__SET_|change[-_]?me|change[-_]?this|replace[-_]?me|your[-_]?secret|dev-only-insecure-secret|example[-_]?secret/i

const MIN_SECRET_LENGTH = 32

export function resolveJwtSecret(context: string): string {
  const secret = (process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim()
  const isProd = process.env.NODE_ENV === 'production'

  const problems: string[] = []
  if (!secret) {
    problems.push('未配置 JWT_SECRET')
  } else {
    if (PLACEHOLDER_RE.test(secret)) problems.push('仍是占位/示例值')
    if (secret.length < MIN_SECRET_LENGTH) problems.push(`长度 ${secret.length} < ${MIN_SECRET_LENGTH}`)
  }

  if (problems.length === 0) return secret

  const detail = `[${context}] JWT_SECRET 不安全：${problems.join('；')}。请用 \`openssl rand -hex 32\` 生成随机密钥`
  if (isProd) {
    // 生产环境 fail-fast：宁可容器起不来，也不要带着可预测的签名密钥对外服务
    throw new Error(`[FATAL] ${detail}`)
  }
  console.warn(`[WARN] ${detail}；开发环境继续使用不安全的默认密钥，切勿用于生产`)
  return secret || DEV_FALLBACK_SECRET
}
