/**
 * 金额单位换算（唯一事实源）。
 *
 * 存储：Expense.amountCents = 整数「分」——浮点元直接求和会累积 0.1+0.2 类
 * 二进制精度误差，整数分求和永不丢精度。API / 前端契约仍是「元」（number），
 * 换算只发生在服务层边界，因此 Web 前端与移动端 App 均无需感知。
 * 列迁移（元→分回填）见 scripts/apply-schema-migration.cjs 的 Expense 段。
 */

/** 元 → 分（四舍五入到整数分；0.1 类二进制浮点误差在此收口） */
export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

/** 分 → 元（整数分除以 100，结果精确到 0.01） */
export function centsToYuan(cents: number): number {
  return cents / 100
}
