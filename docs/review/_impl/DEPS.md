# 依赖治理报告（B8 · 2026-10-19）

> 对应评审：P2-36「依赖升级（nodemailer/mysql2/next 评估）」+ B8 收尾。
> 基线版本 1.24.9 / build 55；所有数字来自本机 `npm audit --json` 实测（Node 24 / npm 11）。

## 结论速览

- 漏洞总数 **43 → 29**（high **24 → 13**，critical 0；low 7→5，moderate 12→11）。
- 运行时可利用面已清空：**nodemailer / prisma / @prisma/config / mysql2 四条 high 链路全部消除**；
  剩余 13 high 全部落在 **dev/build 链路**（Lighthouse CI、eslint-config-next、tailwind 3、以及上游尚无补丁的 braces/extract-zip），不进生产运行时产物。
- 大版本（next 16 / prisma 8 / react 20? / tailwind 4 / eslint 10）只评估、不升级，逐条给了触发条件与风险（见 §4）。
- 唯一一处代码改动：`lib/infrastructure/mailer.ts` 两行类型注解（nodemailer 10 自带类型后 `nodemailer.Transporter` 命名空间失效），纯类型零行为，Lead 已批准。

## 1. 本轮实际升级/覆盖

| 依赖 | 变化 | 类型 | 消掉的 high | 验证 |
|---|---|---|---|---|
| `nodemailer` | 9.1.1 → **10.1.7** | 直接运行时 | 5 条（地址解析 DoS / SMTP 凭据泄漏等） | tsc + vitest + build；API `createTransport`/`sendMail` 用法不变，CJS 主入口、自带类型 |
| `prisma` / `@prisma/client` | 7.10.0 & 7.9.0 → **7.10.1 / 7.10.1** | 直接（CLI/客户端） | prisma、@prisma/config 两条（其传递依赖 deepmerge-ts 8.0.2 已修复），并顺带消除两处版本不一致 | `prisma validate` + `prisma generate` + tsc/vitest/build |
| `mysql2` | 3.24.6（override 统一嵌套副本） | 运行时传递 | 2 条（认证插件降级/解压炸弹） | tsc/vitest/build；无 MySQL 实例，未做真库冒烟 |
| `postcss` | 8.5.31（override） | 构建期 | 1 条（sourceMappingURL 任意读） | build 通过 |
| `tmp` | 0.2.7（override） | dev | 1 条（临时目录符号链接逃逸） | 仅 CI/lhci 链路 |
| `basic-ftp` | 6.2.3（override） | dev | 1 条（连带 get-uri/pac-proxy-agent/proxy-agent） | 仅 @lhci/cli 链路 |
| `braces` / `micromatch` / `fast-glob` | 3.0.3 / 4.0.8 / 3.3.3（override） | dev/build | **未消除**（见 §3 根因） | overrides 让嵌套副本统一到最新，上游补丁一发布即可跟随 |

`package.json` 新增 `overrides` 字段（上面的 tmp/braces/micromatch/fast-glob/basic-ftp/postcss/mysql2）；`package-lock.json` 已随之更新。

### 回退与再升级记录（nodemailer）

1. 首次升级 10.1.7 后 `npm run typecheck` 报 `lib/infrastructure/mailer.ts(16,18)/(18,28) TS2503 Cannot find namespace 'nodemailer'`；按 Lead 要求先回退到 9.1.1 复绿。
2. 随后 Lead 批准「改 2 行类型」：新增 `import type { Transporter } from 'nodemailer'`，两处 `nodemailer.Transporter` → `Transporter`；再次升级 10.1.7 并全量验证通过。
3. 教训：nodemailer ≥10 自带类型，`@types/nodemailer@8` 不再被采用；以后升级这类「自带类型」的包要先看 d.ts 的导出形态。

## 2. 最终审计状态（2026-10-19）

`npm audit --json`：`{ low: 5, moderate: 11, high: 13, critical: 0, total: 29 }`。

## 3. 剩余 13 条 high：根因与处理

| 包 | scope | 根因 | 处理 | 到期 |
|---|---|---|---|---|
| `braces` | build/dev | 上游最新 3.0.3 仍在 advisory 范围（`<=3.0.3`），**无修复版本** | allowlist；跟进 upstream，或随 tailwind 4 迁移 | 2027-01-31 |
| `extract-zip` | dev | 上游最新 2.0.1 仍在 advisory 范围（`<=2.0.1`），**无修复版本** | allowlist；仅 @lhci/cli 使用 | 2027-01-31 |
| `chokidar` / `micromatch` / `fast-glob` | build/dev | 聚合条目，根因同上（braces） | allowlist | 2027-01-31 |
| `@lhci/cli` / `@lhci/utils` / `lighthouse` / `puppeteer-core` / `@puppeteer/browsers` | dev | 性能审计工具链，传递依赖 extract-zip/braces；npm 建议的修复是**降级** @lhci/cli 0.6.1（不可接受） | allowlist；评估改用 `lhci` 手动跑 / 升级上游 | 2027-01-31 |
| `eslint-config-next` / `@next/eslint-plugin-next` | build/dev | 传递依赖 braces/fast-glob；修复建议是降级 14.x（不可接受） | allowlist；随 eslint 9/10 + 新 config 一起迁移 | 2027-01-31 |
| `tailwindcss` | build | 3.4.19 在 advisory 范围（`<=3.4.19`），修复需 **tailwind 4** 大版本 | allowlist；tailwind 4 单独排期（见 §4） | 2027-01-31 |

> 说明：这些包均不进入生产运行时镜像（devDependencies 在 Docker runner 会被 `npm prune --omit=dev` 删掉；tailwind/postcss 只参与构建）。`scripts/audit-gate.cjs` 对未豁免的 high/critical 仍会红灯，到期必须复评。

## 4. 大版本评估（本轮不升级）

### 4.1 next 15.5.x → 16.4.2

- **收益**：修复 next 内置 postcss 的 high（本仓库直接依赖已 override 到 8.5.31，但 next 自带的副本仍在 advisory 范围）；Turbopack 稳定化、React 19.2 支持更好。
- **风险**：App Router 缓存/`params`/`searchParams` 语义继续收紧；`next lint` 移除、middleware 运行时变化；Capacitor 静态导出（`MOBILE_EXPORT=1 → out/`）需要完整回归；本项目有 5 个 dynamic ssr:false 的 WebGL 渲染器与 ISR/静态页混合，需逐页验证。
- **建议**：先升到 15.5 最新补丁；单独分支做 16 升级，验收清单 = CI 全绿 + E2E 冒烟 + 移动端 build-mobile + 手工回归 `/`、`/album`、`/travel/[slug]`、`/admin`。

### 4.2 prisma 7.10.1 → 8.0.0-rc.23

- 当前 8.x 只有 **rc**（`8.0.0-rc.23`），prisma 官方明确 RC 不用于生产；且 8.x 会继续调整 driver adapter/config 形态，与本项目自定义 `lib/prisma-adapter.ts` + `prisma.config.ts` 强相关。
- **决定**：不升级；8.x 正式版发布后单独评估（重点：`migrate diff/deploy` 命令行兼容、`prisma.config.ts` schema、mysql2 adapter 行为）。

### 4.3 react 19.0.0 → 19.3.1（minor，非大版本）

- 属 minor 升级，但必须与 `react-dom` 同日升级并确认 Next 15.5 的对等依赖区间；本项目大量 `useEffect` 严格模式行为与 WebGL 生命周期对 React 版本敏感。
- **建议**：等 next 16 一起升（next 16 对 React 19.2+ 支持更好），避免两次回归。

### 4.4 tailwindcss 3.4.19 → 4.3.3（major）

- tailwind 4 改为 CSS-first 配置，`tailwind.config.js` + `postcss.config.js` 需要整体迁移；本项目刚完成 P2-31 token 三层化（`app/tokens.css`），此时再叠 tailwind 4 会让视觉回归定位困难。
- **建议**：token 稳定一个版本后单独排期；迁移前先固化截图基线（P3-38 视觉回归）。

### 4.5 eslint 8.56 → 10.13（major）

- eslint 8 已 EOL；eslint 9/10 使用 flat config，`eslint-config-next` 需同步升级，且会改变现有 486 条 warning 的统计口径（lint 预算需要重算）。
- **建议**：与「lint 预算清理到 0」一起做，避免两次改门禁。

## 5. 验证方式（本轮实测）

```bash
npx tsc --noEmit --incremental false      # exit 0
npx vitest run --reporter=dot             # 103 文件 / 937 用例全过
SKIP_DB_ON_BUILD=1 npx next build         # exit 0（生产同款构建模式；84/84 静态页）
node scripts/audit-gate.cjs               # exit 0（13 high 全部命中未过期豁免）
npx prisma validate && npx prisma generate # 7.10.1 正常
```

> 本机无 MySQL/Docker：mysql2/prisma 的运行时行为未做真库冒烟，依赖 CI 的 MySQL service 与部署环境覆盖。

## 6. 维护约定

1. 升级任何依赖后必须跑：`tsc` + `vitest` + `build` + `audit-gate`；任一失败回退 lock 并记录。
2. 改 `overrides` 后要 `npm install` 重新生成 lock（否则 CI `npm ci` 与本地不一致）。
3. allowlist 到期（2027-01-31）前复评；上游修复后删条目，不要续期了事。
4. Dependabot 只自动提 patch/minor；major 一律人工排期（见 `.github/dependabot.yml` 的 ignore 列表）。
