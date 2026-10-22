# 文档治理报告（P3-40 · 2026-10-19）

> 对应评审 P3-40「文档治理：改动记录拆 ADR、CHANGELOG 自动生成、删除失效注释」。
> 本轮交付 = 可执行脚本 + 模板 + 失效注释盘点；不一次性重写历史文档（避免破坏既有引用）。

## 1. 变更记录拆分（C-40a）

**脚本**：`scripts/split-changelog.cjs`

- 输入：`docs/design/改动记录.md`（366KB / 4551 行 / **113 个 `## YYYY-MM-DD` 节**）；
- 输出：`docs/design/changelog/YYYY.md`（按年份，内部按季度生成目录后原样保留各节）+ `docs/design/changelog/README.md`（年份索引）；
- 实测：生成 `2026.md`（367.2KB，113 节）+ `README.md`（669B）；
- **幂等**：连续执行两次，两个输出文件 sha256 完全一致；`--check` 模式 exit 0（不一致时 exit 1，可用于 CI/pre-commit）；
- **不改原文件**：`docs/design/改动记录.md` 继续作为 index + 完整历史；归档只做检索加速，避免一次性大迁移导致外链/历史 git blame 断裂。

```bash
node scripts/split-changelog.cjs             # 生成/更新
node scripts/split-changelog.cjs --check     # 只校验（CI 用）
node scripts/split-changelog.cjs --dry-run   # 看统计
```

**当前年份分布**：2026 年 113 节（08 月 2 节起，09/10 月为主）。新增年份时脚本自动生成新文件，无需改代码。

## 2. ADR（架构决策记录，C-40b）

- `docs/adr/README.md`：什么时候必须写 ADR、命名/状态流转（Proposed → Accepted → Superseded）、评审与引用方式；
- `docs/adr/TEMPLATE.md`：背景/决策/备选方案对比表/影响（正负+风险缓解）/验证与复查/参考；
- 索引表先留空（第一条 ADR 开始填）；本批次的 P0/P1 决策（迁移基线、发布门禁、CORS/密钥 fail-fast）建议由 Lead 补成 ADR-0001..0003。

## 3. 发布说明模板（C-40c）

- `scripts/release-notes-template.md`：CHANGELOG 条目结构（新增/修复/优化/安全/升级注意/验证）+ 发版前 7 项检查清单；
- 与现有 `scripts/bump-version.cjs` / `scripts/verify-version.cjs` / `docs/DEPLOYMENT.md` 的发布流程对齐（迁移用 `migrate deploy`、部署前备份 <26h、镜像回滚）。

## 4. 失效注释/文档盘点（只盘点，不跨 owner 修改）

| # | 位置 | 现状 | 建议 |
|---|---|---|---|
| 1 | `next.config.js` | ✅ **已修（2026-10-22）**：ESLint 8→10 / Next 16 后注释已改为「构建期不再跑 lint，lint 一律走独立命令 `npm run lint`（预算收敛在 package.json 脚本）」，与 CI/Dockerfile 实际调用一致 | 完成（保留说明避免再次误加 `eslint` 配置） |
| 2 | `lib/infrastructure/mailer.ts` | ✅ **已修（2026-10-22）**：文件头引用从 `docs/EMAIL_SETUP.md` 改为 `docs/DEPLOYMENT.md「邮件服务」章节（原 docs/EMAIL_SETUP.md 已并入）` | 完成 |
| 3 | `scripts/apply-schema-migration.cjs`（24.8KB）与 `scripts/migrate-r1-profile-cover.cjs` | ✅ **已标记（2026-10-22）**：两者仅被注释/错误提示文字引用，无 entrypoint/CI/应用代码调用；已在文件头加 `@deprecated`「历史一次性脚本，勿用于新库或常规发版」（不删除，保留旧库排查能力） | 完成（归档到 scripts/archive 仍可后续做） |
| 4 | `docs/design/改动记录.md`（366KB 单文件） | 已拆分归档但原文件仍是唯一事实源；继续追加会持续膨胀 | 保持「只追加 + 定期 `split-changelog`」；下阶段可把新增节直接写进年份文件并让 index 只留指针 |
| 5 | `CHANGELOG.md`（92KB 手工维护） | 与 `docs/design/改动记录.md` 存在双写成本 | 已给模板；后续评估 `standard-version`/`release-it` 自动生成（需先统一提交规范） |
| 6 | `docs/review/_findings/**`、`docs/review/_impl/**` | 评审过程产物，长期保留会与正式文档混杂 | 评审结束后移动到 `docs/review/archive/` 并在 `docs/review/README.md` 标注时效 |

> 1–3 已于 2026-10-22 收尾修复（见 §7）；4–6 属于文档策略，机制已给出、按计划推进。

## 5. 验证

```bash
node scripts/split-changelog.cjs             # 生成 2 个文件
node scripts/split-changelog.cjs --check     # exit 0（幂等/一致性）
node --check scripts/split-changelog.cjs     # 语法
```

## 6. 本轮未做（deferred）

- ~~CHANGELOG 自动生成~~ ✅ 已完成（2026-10-22）：`scripts/generate-changelog.cjs` + `npm run changelog`，见 §7；
- 把既有评审产物归档到 `docs/review/archive/`（涉及其他 owner 的目录，建议 Lead 统一执行）；
- 删除 `scripts/apply-schema-migration.cjs` 等历史脚本（需确认是否还有旧库一次性迁移场景；当前已加 @deprecated 标记，暂不删）。

## 7. 收尾记录（task-37 · 2026-10-22）

**已完成**

1. **CHANGELOG 自动生成**：新增 `scripts/generate-changelog.cjs`（解析 Conventional + 历史批次式前缀；过滤 merge、同组同文案去重；支持 `--from/--to/--output/--check`；`--self-test` 纯函数自测），`package.json` 增加 `changelog` 脚本；
   - 生成 v1.0.0..HEAD：259 条提交 / 288 行（分组 feat 77 等）；
   - 可复现：同 HEAD 连续两次生成 sha256 一致；`--check` exit 0；
2. **发布说明**：新增 `docs/release/v1.27.0.md`（人工精简：Tailwind 4 / 多副本 / Prisma 8 门禁 / sharp 安全补丁 / 发版工程）；
3. **失效注释修复（§4 的 1–3）**：见上表 ✅；
4. `npm run prisma:ready`（task-34 门禁）保持可用，作为 Prisma 8 升级提醒。

**验证命令**

```bash
node scripts/generate-changelog.cjs --self-test
node --check scripts/generate-changelog.cjs
node scripts/generate-changelog.cjs --from v1.0.0 --to HEAD --output <file>
node scripts/generate-changelog.cjs --from v1.0.0 --to HEAD --check --output <file>
npx tsc --noEmit --incremental false
npx vitest run
```

**遗留**：§6 的评审产物归档与历史脚本删除（需 Lead/对应 owner 决策）；CHANGELOG.md 与 docs/design/改动记录.md 的双写成本仍存在（后续可用生成器输出替换手工 CHANGELOG 的历史段）。
