# Prisma 8 升级 Runbook（预演版 · 2026-10-20）

> 状态：**未就绪，禁止生产升级**。本文记录 task-34 在隔离 worktree（`upgrade/prisma8`，base `7f89729`）的预演结果，作为 Prisma 8 stable 发布后的执行手册。
> 就绪判定：`npm run prisma:ready`（`scripts/prisma-upgrade-readiness.cjs`）必须 exit 0。

## 0. 当前就绪状态（实测输出摘要）

```json
{"ready": false,
 "node": {"current": "24.12.0", "enginesCovered": false},
 "prisma": {"latestTag": "8.0.0-rc.23", "latestTagIsStable": false, "highestStable": "7.10.1", "target": null},
 "client": {"latestTag": "7.10.1", "target": null},
 "blockedReasons": ["prisma 没有 stable >= 8（registry latest=8.0.0-rc.23；最高 stable=7.10.1）"]}
```

- `prisma` 只有 RC（8.0.0-rc.23），stable 仍是 7.10.1；
- `@prisma/client` 没有 8.0.0-rc.*（安装直接 `ETARGET`），8.x 仅有 dev tag `8.1.0-dev.9`；
- `prisma@8.0.0-rc.23` engines `^22.18.0 || ^24.11.0 || >=26.0.0`（不支持 Node 20；当前机器 Node 24.12 覆盖）。

## 1. 预演记录（2026-10-20，worktree `upgrade/prisma8`）

### 1.1 安装尝试

| 尝试 | 结果 |
|---|---|
| `npm i --save-exact prisma@8.0.0-rc.23 @prisma/client@8.0.0-rc.23` | ❌ `ETARGET: No matching version found for @prisma/client@8.0.0-rc.23` |
| `npm i --save-exact --ignore-scripts --legacy-peer-deps prisma@8.0.0-rc.23 @prisma/client@8.1.0-dev.9` | ⚠️ 可安装（prisma 8.0.0-rc.23 + client 8.1.0-dev.9）；但 npm 在 ESLint 10/Next 16 的 peer 树上解析极慢，`.bin` 未完整生成，预演使用 `node node_modules/prisma/dist/prisma.js` 直接调用 |

### 1.2 CLI 形态变化（8.0.0-rc.23 实测）

1. **CLI 是平台化重写**：顶层命令变成 `auth / project / postgres / bucket / branch / git / service / deploy / dev / contract / migration / db ...`，输出改为 JSON envelope（`{"kind":"result","envelope":{...}}`）。
2. **`prisma validate` / `prisma generate` 不再存在**：
   ```text
   {"error":{"code":"CLI.UNKNOWN_COMMAND","summary":"No command registered for `validate`"}}
   {"error":{"code":"CLI.UNKNOWN_COMMAND","summary":"No command registered for `generate`"}}
   ```
   替代：`prisma contract emit|infer|format|print`（contract = PSL 数据模型，emit 生成产物）。
3. **`prisma migrate` 改名为 `prisma migration`**：
   ```text
   CLI.UNKNOWN_COMMAND: No command registered for `migrate`, did you mean `migration`?
   ```
   `migration` 子命令：`check / graph / list / log / new / plan / show / status / ref`；**应用迁移走 `prisma db migrate`**（help 原文：“Apply them with 'db migrate'”）。
   即：本仓库 P0 落地的 `prisma migrate deploy`、`prisma migrate diff --from-migrations ... --exit-code`（CI drift 门禁）、`scripts/migrate-bootstrap.cjs` 里的 `migrate resolve` 全部需要重写为新命令/新流程。
4. **`prisma.config.ts` 的 `defineConfig` 导出被移除**：
   ```text
   prisma.config.ts(4,10): error TS2305: Module '"prisma/config"' has no exported member 'defineConfig'.  // tsc 实测
   ```
5. 迁移概念变化：8.x 的 migration 是「on-disk package，由 contract 变更派生」，与 7.x 的 `prisma/migrations/*.sql` 目录格式**很可能不兼容**（需要以 stable 文档验证，必要时重建基线）；`_prisma_migrations` 表兼容性也必须实测。

### 1.3 项目代码编译影响

- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：**1 个错误**（`prisma.config.ts` 的 `defineConfig` 不存在）；`lib/prisma-adapter.ts` + `lib/db.ts` 在 client 8.1.0-dev 类型下未报错（仅说明类型表面兼容，**运行时未验证**）。
- 本机无 MySQL：`prisma db migrate` / migration check 的生产路径**未执行**；client 8 dev tag 是否可生产使用**未验证**。

## 2. 触发条件（全部满足才启动正式升级）

1. `npm run prisma:ready` exit 0：prisma stable ≥8 + `@prisma/client` 同 major.minor stable + engines 覆盖团队 Node 矩阵；
2. 官方 stable release notes 明确 `prisma-client`/contract/migration 的最终形态，且 `db migrate` 可用；
3. Node 矩阵决策：8.x 要求 `^22.18 || ^24.11 || >=26` → 统一 CI/Docker/本地 Node，并更新 `engines`（当前 `^20.19 || ^22.13 || >=24 <25` 里的 20.x 会被 v8 拒绝）；
4. 在独立 worktree/分支预演通过（本 runbook §3），且 staging 有 MySQL 可执行迁移。

## 3. 升级步骤（stable 发布后执行）

1. **准备**：`git worktree add C:/CodeFiles/tn-prisma8-upgrade upgrade/prisma8`；`npm ci`；数据库最近备份 <26h（`bash scripts/backup-db.sh --check`）；记录当前镜像/commit。
2. **依赖**：`npm i --save-exact prisma@<stable> @prisma/client@<同版本>`；确认 `npm ls prisma @prisma/client` 无重复版本；更新 `package.json engines`（去掉 Node 20 或按官方范围）。
3. **config/contract**：按 8.x 文档重写 `prisma.config.ts`（不再 `defineConfig`）；`prisma contract format/print` 校验 PSL；`prisma contract emit` 生成 client 产物，更新 `lib/db.ts` / `lib/prisma-adapter.ts` 的 import 路径与类型（若输出位置变化）。
4. **迁移链改造**：`migrate-bootstrap.cjs`（`migrate resolve` → 8.x 等价）、`docker-entrypoint.sh`（`migrate deploy` → `db migrate`）、CI drift 门禁（`migrate diff --from-migrations` → `migration check`/`migration plan --exit-code` 等价）；**先在空库与新 migration package 格式上验证基线重放**。
5. **门禁**：`npx tsc --noEmit --incremental false` 0；`npx vitest run` 全绿；`npm run lint`；`tokens:check`/`parity`；`SKIP_DB_ON_BUILD=1 npx next build`。
6. **真库验证（staging）**：`prisma db migrate` → `prisma migration status/log` → `prisma db verify`（若存在）；跑登录/旅行/相册/时间线/同步队列冒烟；对比 `_prisma_migrations` 与备份行数。
7. **发布**：镜像 tag + 回滚备份保留；生产按既有 `server-rebuild.sh` 流程（备份闸门 → 构建门禁 → 健康检查）。

## 4. 风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| migration 目录/表格式不兼容 | 生产迁移失败或重复建表 | staging 空库重放 + 现有库 `migration status` 核对；必要时重建基线并走一次 `resolve` |
| `prisma.config.ts` API 变化 | 启动/CI 全挂 | 按 stable 文档重写，`contract print` 做配置自检 |
| driver adapter（mysql2 自定义）API 变化 | 运行时查询失败 | `lib/prisma-adapter.ts` 对照新 adapter 接口重写 + 全量单测 + 真库回归 |
| client dev tag 不可用于生产 | 不可接受的稳定性风险 | 只等 stable client；ready gate 强制同 major.minor stable |
| Node 版本矩阵 | CI/Docker/本地不一致 | 统一到官方 engines 范围，Dockerfile/CI 同步 |
| CLI 平台化（auth/project/postgres）引入新配置/遥测 | 部署脚本行为变化 | 审阅 stable 文档与 CLI 默认行为，禁用在 CI 中不需要的平台命令 |

## 5. 回滚

- 依赖/代码：`git revert <upgrade commit>` 或回到升级前 tag；`npm ci`；`npx prisma generate`；
- 数据库：用升级前备份 `bash scripts/migrate-database.sh restore <file>`（或备份脚本产物）恢复到临时库验证后，再决定是否回滚生产；
- 镜像：`docker tag travel-notes-app:previous <tag> && docker compose up -d --no-build --force-recreate app`（沿用 server-rebuild 的回滚提示）。

## 6. 验收清单（stable 升级 PR 必须全绿）

- [ ] `npm run prisma:ready` exit 0（且输出中的版本写进 PR 说明）
- [ ] `tsc` 0 / `vitest` 全绿 / `lint` 0 error / `tokens:check`+`parity` / `next build`
- [ ] 空库：migration package 从基线完整重放成功
- [ ] 存量库（staging 备份恢复）：`migration status` 无 pending/无 drift，核心读写冒烟通过
- [ ] CI drift 门禁与 entrypoint 已改用 8.x 命令；`migrate deploy`/`db push` 无残留
- [ ] Docker build + `docker compose up` 后 `/api/health` 200、上传/相册/时间线冒烟通过
- [ ] 回滚演练：按 §5 回滚到 7.10.1 镜像 + 备份库，服务可用
