/**
 * 低内存构建优化：构建阶段（next build）跳过数据库读取。
 * 与 lib/db-posts.ts 中的 skipDbOnBuild 保持同一策略：
 * 部署脚本设置 SKIP_DB_ON_BUILD=1 时，构建期返回空数据（轻量壳），
 * 运行时由 ISR 按需生成真实内容，降低 2C2G 服务器构建内存峰值与耗时。
 */
export function skipDbOnBuild(): boolean {
  return process.env.SKIP_DB_ON_BUILD === '1' && process.env.NEXT_PHASE === 'phase-production-build'
}
