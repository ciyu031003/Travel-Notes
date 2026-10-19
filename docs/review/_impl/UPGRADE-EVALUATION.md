# 大版本升级评估与尝试（B 批次 · task-30）

> 工作区：独立 worktree `C:\CodeFiles\tn-upgrade`（分支 `upgrade/majors`，基线 `7f1fa39`，版本 1.25.0/56）。
> 纪律：不 push、不合并 master；每项升级必须 tsc + vitest + lint + tokens:check + tokens:parity + build 全绿才 commit，否则回滚并在本文记录报错。
> 环境：Node 24.12 / npm 11；本机无 MySQL/Docker，build 采用生产同款 `SKIP_DB_ON_BUILD=1`。

## 0. 结果总表

| # | 升级项 | 结论 | commit | 关键验证 |
|---|---|---|---|---|
| ① | Next 15.5 → **16.4.2**（React 19.0 → 19.3.1） | ✅ 成功 | `9957e44 chore-upgrade-next16` | tsc 0 / vitest 103 文件 938 用例 / lint 0 error / tokens+parity pass / Turbopack build 84⁄84 静态页 |
| ② | ESLint 8 → **10.13**（flat config） | ✅ 成功 | `530ef11 chore-upgrade-eslint10` + `300b52e chore-eslint10-node-engines-and-gates` | lint 0 error / 460 warning（预算内）/ tsc / vitest / build 全绿 |
| ③ | Tailwind 3.4 → **4.3.3** | ❌ 回滚 | 无（`git reset --hard 530ef11`） | build 失败：`Cannot apply unknown utility class 'sm:px-6'`（详见 §3） |
| ④ | Prisma 7.10 → 8.x | ⏸ 仅评估 | 无 | 8.x 仍为 RC，且 `@prisma/client` 无 8.x 稳定版（详见 §4） |

分支最终包含 ①② + 文档提交；Tailwind 4 改动已完全回滚。

## 1. ① Next 16.4.2 升级（成功）

### 改动

- `next` 15.5.27 → **16.4.2**；`react` / `react-dom` 19.0.0 → **19.3.1**；`@types/react*` 同步。
- **`tsconfig.json` 去掉 UTF-8 BOM**：这是本次唯一一个「非官方 breaking change 文档里没有」的坑 —— Next 16 默认 Turbopack 的 tsconfig 解析器遇到 BOM 直接报 `An issue occurred while parsing a tsconfig.json file`，随后 880 个 `Can't resolve '@/...'` 假错误（别名完全失效）；Webpack 时代可容忍 BOM。去掉 BOM 后全部消失。
- **`next.config.js` 删除 `eslint` 配置块**：Next 16 的 build 不再跑 ESLint，且 `eslint` 已是 `Unrecognized key`（lint 由独立命令/CI 负责）。
- **`middleware.ts` → `proxy.ts`**：Next 16 弃用 middleware 文件约定，改为 proxy；内容与执行顺序不变，仅 `export async function middleware` → `export default async function proxy`（并加迁移注释）；`tests/security/csrf.test.ts` 的 import 同步改为 `../../proxy`。构建日志确认 `ƒ Proxy (Middleware)` 仍然生效（安全头/鉴权/CSRF/CORS 逻辑不变）。
- `next-env.d.ts` 由 Next 16 重新生成（随 commit 提交）。
- 未使用官方 codemod：本次改动点只有 middleware 改名 + 配置清理，手工迁移更可控（codemod 还会扫全仓，噪声大）。

### 验证（全部通过）

```text
npx tsc --noEmit --incremental false   → exit 0
npx vitest run --reporter=dot          → 103 文件 / 938 用例全过
npm run lint                           → 0 error（该 commit 时仍是 ESLint 8 口径）
node scripts/check-design-tokens.mjs --check-baseline → ✅ 无新增回退
node scripts/check-token-parity.mjs    → PASS 全部相等
SKIP_DB_ON_BUILD=1 npx next build      → exit 0，✓ Compiled successfully，84/84 静态页（Turbopack 默认 bundler）
```

### 已知警告（不阻断，建议后续处理）

- Turbopack build 报 11 条 `Dynamic filesystem access causes tracing of the whole project`，集中在 `app/api/uploads/[...path]/route.ts`（`fs.createReadStream`/`existsSync` 动态路径）。后果是 server 产物会 trace 整个项目（部署体积/启动变慢）；处理方式：把路径静态收敛到 `public/uploads` 子目录，或在调用处加 `/*turbopackIgnore: true*/`。
- 无 middleware 弃用警告（已迁移），无 `eslint` 配置警告。

## 2. ② ESLint 10.13 迁移（成功）

### 改动

- `eslint` 8.56 → **10.13.0**；`eslint-config-next` 15.5 → **16.4.2**（peer 要求 eslint >=9）。
- 删除 `.eslintrc.json`，新增 **`eslint.config.mjs`**（flat config）：展开 `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`，保留 `@typescript-eslint/no-explicit-any: warn`，并 globalIgnores `.next/out/node_modules/coverage/www/public/test-results/playwright-report`。
- `package.json` lint 脚本去掉 ESLint 10 已移除的 `--ext`，改为 `eslint app components hooks lib --max-warnings=460`（**warning 预算收敛到脚本单一来源**；CI 与 Dockerfile 都只调 `npm run lint`，不再各自写 486）。
- **engines 收紧**：`>=20 <25` → `^20.19.0 || ^22.13.0 || >=24.0.0 <25`（ESLint 10 的 engines 为 `^20.19.0 || ^22.13.0 || >=24`，原声明包含 20.0–20.18/21/23 等不支持版本）；`.nvmrc` 仍为 22。
- **React Compiler 新规则显式关闭**（eslint-config-next 16 / react-hooks v6 默认把以下规则设为 error），存量代码命中 115 处：`react-hooks/set-state-in-effect` 67、`react-hooks/immutability` 28、`react-hooks/refs` 12、`react-hooks/purity` 5、`react-hooks/preserve-manual-memoization` 3。本批次只做版本迁移，不改业务代码，故在 flat config 中 `off` 并留注释；后续应专项清理后逐条开启（可先开 warn）。

### 验证（全部通过）

```text
npm run lint                 → 0 error / 460 warning（exit 0，预算内）
npx tsc --noEmit --incremental false → exit 0
npx vitest run --reporter=dot        → 103 文件 / 938 用例全过
node scripts/check-design-tokens.mjs --check-baseline → ✅
node scripts/check-token-parity.mjs  → PASS
SKIP_DB_ON_BUILD=1 npx next build    → exit 0（84/84）
```

## 3. ③ Tailwind 4.3.3 尝试（失败，已回滚）

### 尝试内容

- `tailwindcss` 3.4.19 → 4.3.3，`@tailwindcss/postcss` 4.3.3；`postcss.config.js` 改为 `{ '@tailwindcss/postcss': {} }`（v4 不再需要 autoprefixer）；
- `app/globals.css`：顶部加 `@import "tailwindcss";` + `@config "../tailwind.config.js";`，删除旧的 `@tailwind base/components/utilities`。

### 阻塞点（build 直接失败）

```text
Error: Turbopack build failed with 1 error:
CssSyntaxError: tailwindcss: app/globals.css:1:1: Cannot apply unknown utility class `sm:px-6`.
```

具体原因与工作量：

1. **`@apply` 不允许带变体**：globals.css 有 **5 个 `@apply` 块，其中 3 个含变体**（`sm:px-6`、`lg:px-8`、`dark:`、`hover:`），v4 要求改成 `@variant` 或把变体展开写。逐处改写 + 视觉核对是必须的。
2. **`@tailwindcss/typography` 插件走 JS config 不再被 v4 支持**：v4 要求在 CSS 里 `@plugin "@tailwindcss/typography";`，现有 `tailwind.config.js` 的 `plugins: [require('@tailwindcss/typography')]` 需要迁移；否则文章排版样式静默丢失。
3. **视觉无法本地验收**：本任务只跑得通构建/类型/token 门禁，没有浏览器/截图基线；Tailwind 4 的 preflight、默认调色板、`@apply` 语义变化都可能造成全站视觉回归，仅靠 `tokens:check`/`parity` 不足以保证。
4. 补充：globals.css 另有 24 处 `!important`，v4 下优先级行为需要重新核对。

### 处置

- `git reset --hard 530ef11` 回滚全部 Tailwind 改动 + `npm ci` 恢复依赖（tailwindcss 3.4.19 已确认）。
- 建议：单独分支 + 先做截图基线（P3-38 视觉回归），按「typography 插件 → @apply 变体 → preflight 差异 → 视觉回归」顺序迁移，预估 1–2 人日；迁移期间不要与 token 三层化同时进行。

## 4. ④ Prisma 8 评估（仅评估，不升级）

### 事实（npm 元数据实测，2026-10-19）

- `prisma` dist-tags：`latest = 8.0.0-rc.23`（**仍是 RC**）、`prev = 7.10.1`；本仓库当前 7.10.1。
- `@prisma/client` dist-tags：`latest = 7.10.1`，8.x 只有 `dev = 8.1.0-dev.9` —— **没有与 prisma 8.0.0-rc 配套的稳定 client 版本**（直接 `npm i @prisma/client@8.0.0-rc.23` 实测 E404）。
- `prisma@8.0.0-rc.23` engines：`^22.18.0 || ^24.11.0 || >=26.0.0` —— **不再支持 Node 20**；本仓库 engines 声明含 20，Dockerfile 用 node:22（需 ≥22.18）。
- 依赖结构大改：新增 `@prisma/cli-engine`、`@prisma/compute-sdk`、`@prisma/orm-toolchain`、`@prisma/management-api-sdk` 等，说明 8.x 是 CLI/运行时的整体重写，不是普通 major。

### 与本项目的耦合点（升级风险）

1. `prisma/schema.prisma` 的 `generator client { provider = "prisma-client-js" }` —— 8.x 主推新的 `prisma-client` 生成器（ESM/显式 output），`prisma-client-js` 的去留需按正式版文档确认；
2. `lib/prisma-adapter.ts`（528 行自定义 mysql2 适配器）+ `lib/db.ts` 的 `PrismaClient` 构造 —— driver adapter API 在 8.x 若有签名/生命周期变化，需要重做适配层并回归全部数据路径；
3. `prisma.config.ts`（7.x 引入的 config：schema/migrations/datasource）—— 8.x 的迁移/配置命令可能再变（本仓库 P0 刚把迁移基线切到 `migrate deploy` + `migrate diff --from-migrations`，8.x 若改参数会再次破坏门禁）；
4. 数据库迁移：8.x 正式版前不宜动生产迁移链；当前 allowlist 里 prisma 已无 high（7.10.1 已修复）。

### 结论与升级前提

- **现在不升级**（RC + client 未配套 + Node 20 支持被移除）。
- 正式版发布后按此顺序评估：① 在独立 worktree 升级 `prisma`/`@prisma/client` 到同一 stable 版本；② 按新文档改 generator/driver adapter；③ 跑 `prisma validate` + `migrate diff --exit-code`（空 diff）+ 单测；④ 用真实 MySQL 跑 `migrate deploy` 与核心读写回归；⑤ 再合并。

## 5. 合并建议（给 Lead）

### 分支与提交

- 分支：`upgrade/majors`（基于 `7f1fa39`），**未 push、未合并**；
- 提交：
  - `9957e44 chore-upgrade-next16`
  - `530ef11 chore-upgrade-eslint10`
  - `300b52e chore-eslint10-node-engines-and-gates`（engines、CI/Dockerfile lint 预算单一来源）
  - `docs-upgrade-evaluation`（本文件）

### 合并前检查

1. 合并方向建议 `upgrade/majors → master` 走 PR，逐 commit review；不建议 squash（三个 commit 语义独立，便于单独回滚）。
2. 合并后主仓必须：`tsc` / `vitest` / `npm run lint` / `tokens:check` / `parity` / `next build` 全绿；尤其确认 CI 的 Lint step 与 Dockerfile builder 都调用统一的 `npm run lint`（预算 460）。
   > 注意：本机 `npm ci` 因 npm allow-scripts 拦截 prisma postinstall，跑门禁前必须显式 `npx prisma generate`（CI 与 Dockerfile 已有该步骤）；否则 tsc 会报一批 implicit-any、build 报 `.prisma/client` 缺失（本轮实测过）。
3. **Next 16 的 build 已切到 Turbopack**：Dockerfile builder 内存/时间与 webpack 不同，需在 2C2G 服务器实测一次 `docker compose build app`；如 OOM 可临时 `NEXT_TURBOPACK=0`/webpack 回退（不推荐长期）。
4. **middleware→proxy 改名后**，需回归 Nginx 反代下的安全头、CSP、CORS（App 本地壳 origin）、登录重定向与 `/uploads` 静态缓存；建议跑一遍现有 e2e 冒烟（CI 已覆盖 5 spec）。
5. Turbopack 的 `Dynamic filesystem access` 警告：确认 `app/api/uploads` 的 trace 范围可接受（当前会 trace 整个项目），后续单独优化。
6. ESLint 10：CI/Dockerfile 已改为单一预算来源；React Compiler 规则保持 off，待专项清理（115 处）后再开；`engines` 已收紧到 `^20.19 || ^22.13 || >=24 <25`，README 的 Node 说明可同步（当前写 20–24）。
7. Tailwind 4 / Prisma 8 **不要**随本分支合并，按 §3/§4 单独排期。

## 6. 回滚方式

- 整个分支回滚：不合并即可；
- 单 commit 回滚：`git revert 9957e44`（Next 回 15.5）/ `git revert 530ef11 300b52e`（ESLint 回 8，需恢复 `.eslintrc.json`）；
- Tailwind 4 改动未进入任何 commit，无需回滚。
