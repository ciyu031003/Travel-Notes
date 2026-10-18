# 代码设计（模块2）+ 工程化（模块7）评审发现（eng-craft）

> 评审基线：`master` @ `55f8c1b`，版本 1.24.8 / build 54。只读评审，未修改任何源码/配置/依赖。
> 本人实跑（本机 Node 22，2026-10-18）：
> - `npx tsc --noEmit` → **通过**（exit 0，无输出）
> - `npx vitest run --reporter=dot` → **60 文件 / 554 用例全部通过**，22.0s
> - `npm run lint` → **485 problems (0 errors, 485 warnings)**，exit 0
> - `npm audit --audit-level=high --json` → **43 个漏洞：24 high / 12 moderate / 7 low / 0 critical**
> - 目录体积：node_modules 1274.5MB、.next 1132.0MB、android 748.8MB、docs 21.9MB、public 77.1MB

## 结论速览

代码本身的质量明显高于工程化：类型检查干净（0 个 @ts-ignore）、554 个单测真实可跑、分层目录（modules/services/repositories/infrastructure）与自研取数层都有设计痕迹。但「有门禁」和「门禁真的拦得住」是两件事：CI 的 lint 是 485 个 warning 全部放行、audit 是 `|| true` 报告模式、E2E 完全不在 CI；而真正把代码送上线的那条链路（`scripts/server-rebuild.sh` → `docker compose up -d --build`）里 `Dockerfile` 显式 `SKIP_TSC=1`，不跑 lint/test/typecheck，健康检查失败也被 `|| true` 吞掉且无回滚。最严重的两个问题因此是：**发布门禁形同虚设**（P-1/P-3）与**生产容器每次启动对数据库执行 `prisma db push`**（P-2），后者是 schema 漂移/静默数据事故的直接入口。

## 问题清单

### [🔴] P-1 上线链路没有任何质量门禁：Dockerfile 跳过类型检查 + 部署脚本不跑测试 + 健康检查失败不算失败
- **位置**：`Dockerfile:10-13`、`Dockerfile:21`、`scripts/server-rebuild.sh:71-75`、`docs/DEPLOYMENT.md:168-180`
- **问题描述**：镜像构建阶段写死跳过类型检查，部署脚本只做「清盘→解包→重建→curl 一下」：
  ```dockerfile
  ENV JWT_SECRET=build-placeholder-not-for-runtime
  RUN npx prisma generate \
    && SKIP_DB_ON_BUILD=1 SKIP_TSC=1 npm run build
  ```
  ```bash
  sudo docker compose up -d --build app 2>&1 | tail -8
  ...
  sleep 8
  curl -s -H "Host: travel-notes.yuanabd.cn" "https://127.0.0.1/api/health" || true
  ```
  `next.config.js:26` 把 `SKIP_TSC=1` 映射为 `typescript.ignoreBuildErrors`。脚本无 `npm ci/test/lint/typecheck`，无 E2E，health 非 200 也不中断（`|| true` 后继续打印「完成」，`server-rebuild.sh:77` 起只是 `df -h`）。
- **风险影响**：任何一次「本地改完直接打包 scp 上线」都绕开 CI 全部门禁；类型错误/未测试分支会以镜像形式进生产。健康检查失败时脚本仍返回成功，运维以为发布完成，实际可能是 502（DEPLOYMENT.md:185 的 502 排查条目正对应此场景），且没有回滚到上一镜像的步骤——只能重新改代码再发一版。
- **改进方案**：
  1. `Dockerfile:13` 去掉 `SKIP_TSC=1`（构建机内存不足时用 `NODE_OPTIONS=--max-old-space-size=1536` 解决，而不是跳过检查）；配 `docker build --target runner` 单独产出可发布镜像。
  2. `server-rebuild.sh` 在 `docker compose up -d --build` 前加三行硬门禁：`npm ci && npm run typecheck && npm run lint -- --max-warnings=0 && npm test`；失败即 `exit 1`。
  3. 健康检查改为 `curl -fsS .../api/health`，失败时 `docker compose up -d --no-deps --force-recreate app` 回滚到上一 tag 镜像（配合 P-13 的 git tag 与镜像 tag）。
  4. 验证：故意引入一个类型错误（如给函数传错参数），确认 `server-rebuild.sh` 在构建前失败。

### [🔴] P-2 生产容器每次启动执行 `prisma db push`，失败还继续启动
- **位置**：`scripts/docker-entrypoint.sh:7-15`
- **问题描述**：容器启动即做 schema 变更，且三类迁移全部 `|| echo warn` 吞错后继续 `exec npm run start`：
  ```sh
  node scripts/apply-schema-migration.cjs || echo "[warn] 增量迁移未完整执行..."
  node scripts/migrate-r1-profile-cover.cjs || echo "[warn] ..."
  npx prisma db push 2>&1 || echo "[warn] prisma db push 未完全同步..."
  exec npm run start
  ```
  该脚本依赖 `prisma` CLI —— 这正是 `package.json:52` 把 `prisma` 放进 `dependencies`（而非 devDependencies）的原因，也是根治难点。
- **风险影响**：(1) `prisma db push` 不产生迁移历史、不做版本回滚，生产 schema 无审计轨迹；(2) 需要数据丢失的变更时 `db push` 在非交互环境会直接失败（脚本未传 `--accept-data-loss`），失败被 `|| echo warn` 吞掉 → schema 停在旧版本、服务照常启动，表现为「某些接口 500 / 字段读不到」，日志只有一行 warn；(3) 多副本/滚动重启时并发执行 DDL，有锁表与竞争风险。
- **改进方案**：
  1. 改为 `prisma migrate deploy`（保留 `prisma/migrations/`），在**部署阶段**（`server-rebuild.sh` 或独立 `migrate` 一次性容器）执行，`entrypoint` 只做 `exec npm run start`。
  2. 迁移失败必须让部署失败：去掉 `|| echo warn`，改成 `set -e` 生效（当前第 2 行有 `set -e`，但 `||` 把失败吃掉了）。
  3. 把 `scripts/apply-schema-migration.cjs`（24.8KB，手写 DDL 补丁）清零并入 `prisma/migrations`，`migrate-r1-profile-cover.cjs` 降级为一次性脚本归档到 `scripts/archive/`。
  4. `prisma` 移到 devDependencies，runner 阶段 `npm prune --omit=dev`。

### [🔴] P-3 CI 的四个门禁里三个是「不阻断」：lint 485 warning 全过、audit 24 high 全过、E2E 与覆盖率完全不跑
- **位置**：`.github/workflows/ci.yml:40-66`、`.eslintrc.json:1-9`、`package.json:9`
- **问题描述**：CI 确实有 lint/typecheck/test/build/tokens 五步，但：
  ```yaml
  - name: Lint
    run: npm run lint          # 实测 485 warnings，exit 0
  ...
  - name: Dependency audit (high+, report only)
    run: npm audit --audit-level=high || true
  ```
  `npm run lint` 没有 `--max-warnings`，`.eslintrc.json` 里唯一自定义规则 `@typescript-eslint/no-explicit-any: warn`；E2E 21 个 spec 从未进入 CI；`vitest.config.mts` 无 coverage 配置，`npm test` 不产出覆盖率、无阈值。
- **风险影响**：`npm audit` 当前 24 个 high 中 `nodemailer`（SMTP 跨租户凭据泄漏/地址解析 DoS）、`mysql2`（认证插件降级泄漏明文口令/解压炸弹 DoS）、`prisma`、`next`（postcss XSS，需升 16）都是运行时依赖；因为 `|| true`，这些漏洞在任何一次 CI 里都是绿色。lint 485 个 warning 说明「未使用变量/显式 any」这类信号已被完全忽略（例：`lib/repositories/user-repository.ts:1` `prisma` 未使用；`lib/services/token-service.ts:172` 解构的 `jti/exp/iat` 未使用）。E2E 不在 CI 意味着 21 个 spec（含 a11y、OTA、相册阅读器 23KB 大用例）的回归只能靠人工。
- **改进方案**：
  1. CI 中 `npm run lint -- --max-warnings=0`；分批把 warning 清到 0（可先 `--max-warnings=485` 冻结存量，每周下调）。
  2. audit 改阻断：`npm audit --audit-level=high` 去掉 `|| true`；无法立即修的在根目录加 `audit-allowlist.json` + 注释理由，并配 Dependabot（`.github/dependabot.yml`，weekly npm）。
  3. 加 `npm run test:e2e` job（`npx playwright install --with-deps chromium`，复用 MySQL service，`CI=1` 关闭 `reuseExistingServer`）；`playwright.config.ts:10-11` 的 `workers:1 / retries:1` 在 CI 保留 retries=0（抖动必须暴露，而不是掩盖）。
  4. vitest 加 `@vitest/coverage-v8` + `coverage.thresholds`（先 statements 60%），CI 上传 coverage artifact。

### [🔴] P-4 全站 0 个 ErrorBoundary、0 个 `error.tsx`/`not-found.tsx`：渲染异常直接白屏
- **位置**：`app/` 下 192 个文件（`Get-ChildItem app -Recurse -File`），无 `error.tsx`/`global-error.tsx`/`not-found.tsx`/`loading.tsx`；`Select-String getDerivedStateFromError|componentDidCatch` 全仓库 0 命中
- **问题描述**：App Router 的 `app/error.tsx` 是路由级兜底、`not-found.tsx` 是 404 兜底、`global-error.tsx` 是根布局兜底；本仓库一个都没有。客户端也没有任何 `class ErrorBoundary` 包裹重型组件（`app/album/page.tsx` 动态加载了 4 个 WebGL/Canvas 组件）。
- **风险影响**：任何一次运行时异常（WebGL 上下文丢失、`book.pages[i]` 越界、JSON 结构变更）都会让整棵 React 树卸载——用户看到 Next 默认的「Application error: a client-side exception has occurred」英文白屏（移动端 WebView 里更难看），且无从恢复，只能杀掉 App 重进。改版后「相册打不开」这类真机故障会被归因为「玄学」。
- **改进方案**：
  1. 新增 `app/error.tsx`（`'use client'`，含「重试 / 回首页」两个按钮）、`app/global-error.tsx`、`app/not-found.tsx` 三件套，文案走现有设计 token。
  2. 新增 `components/ErrorBoundary.tsx`（class 组件 + `componentDidCatch` 上报），在 `app/album/page.tsx` 的 4 个 `dynamic(..., {ssr:false})` 外层各包一层，失败时降级为静态封面墙。
  3. 验证：在 `components/album/space/GalaxyAlbumScene.tsx` 里临时 `throw new Error('x')`，确认页面显示兜底 UI 而不是白屏。

### [🔴] P-5 备份与监控只存在于文档：无版本化备份 cron、无告警实现、`/api/health` 的 uptime 恒为 null、compose 不给 app 配 healthcheck
- **位置**：`docs/DEPLOYMENT.md:140-148`、`docs/DEPLOYMENT.md:163-168`、`docs/DEPLOYMENT.md:172-177`、`scripts/crontab.travel-notes:1-5`、`app/api/health/route.ts:13-21`、`docker-compose.yml:16-21,23-31`
- **问题描述**：文档 §6.1 要求手工 `crontab -e` 加一条每日 2:30 备份（`DEPLOYMENT.md:145`），但仓库内唯一的 crontab 清单 `scripts/crontab.travel-notes` 只有第 5 行的磁盘清理，**没有备份条目**；`docs/DEPLOYMENT.md:148` 写的「近 7 天/4 周/按月」保留策略没有任何脚本实现（`migrate-database.sh` 只有 `backup/restore` 单次命令，无 prune）；§7 的告警阈值（`DEPLOYMENT.md:177`：磁盘>80%、备份连续失败、探活失败…）在仓库里没有任何采集/发送实现。`/api/health` 读 `process.env.STARTED_AT`，但 `grep STARTED_AT` 只在健康路由出现一次，`docker-entrypoint.sh`/compose 都没设置它 → `uptime` 永远 `null`；compose 只给 `db` 配了 healthcheck，`app` 没有，`docker compose ps` 里 app 永远不会是 healthy。
- **风险影响**：数据库唯一副本在 `mysql-data` named volume（`docker-compose.yml:15`），备份是否真的在跑、是否可恢复，仓库侧无法验证/审计；一旦磁盘故障或误执行 `docker compose down -v`，数据全失且无异地副本。`/api/health` 的 uptime 字段坏了会误导监控脚本。文档与现实脱节是最难排查的一类工程债（新运维按文档操作会以为已配好）。
- **改进方案**：
  1. 新增 `scripts/backup-db.sh`（`mysqldump --single-transaction --routines` + `gzip` + 保留策略 `find backups/db -mtime +30 -delete` + 上传 COS/异地），并把条目写进 `scripts/crontab.travel-notes`（第 5 行后追加）；增加 `--verify` 模式：备份后 `gzip -t` + 恢复到一个临时库并 `SELECT COUNT(*)`，失败退出非 0。
  2. CI 或 `server-rebuild.sh` 增加「备份存在性检查」：最近一次备份 < 26h，否则告警/阻止部署。
  3. `/api/health` 改为在模块顶层记录 `const startedAt = Date.now()`，或在 compose 的 app 环境变量注入 `STARTED_AT`；compose 加 `healthcheck: test: ["CMD","curl","-fsS","http://127.0.0.1:3000/api/health"]`。
  4. 监控落地一个最小实现：cron 每 5 分钟 curl `/api/health`，非 200 走现有 SMTP（`lib/infrastructure/mailer.ts`）发邮件；阈值文档同步删掉未实现的条目。

### [🟡] P-6 自研取数层建好了却几乎没人用：8 个文件用 `apiFetch/useApi`，89 个文件 210 处裸 `fetch`
- **位置**：`lib/client/api.ts:60`、`lib/client/use-api.ts:18`、`app/admin/travels/page.tsx:126-151`、`components/social/MeHome.tsx:127-134`
- **问题描述**：`apiFetch` 已经实现了内存缓存、并发去重、`redirect:'manual'` 的会话失效归一（`lib/client/api.ts:74-93` 的注释还记录了真机 bug 成因）、`useApi` 实现了 AbortController 防竞态。但实际只有 8 个文件引用（app/page.tsx、app/timeline、app/me、app/dashboard、app/download、components/social/MeUserRelationPage、hooks/use-session-redirect 等），而 89 个文件里共有 210 处 `fetch(` 调用（其中 `lib/client/api.ts` 只有 1 处），全仓库 `AbortController` 仅 6 处。典型裸写法：
  ```ts
  // app/admin/travels/page.tsx:141
  const fetchDetail = useCallback(async (id: number) => {
    const res = await fetch(`/api/admin/travels/${id}`)
    if (res.ok) { const data = await res.json(); setDetail(data.travel || null) }
  }, [])
  useEffect(() => { if (selected !== null) fetchDetail(selected) }, [selected, fetchDetail])
  ```
  快速切换条目时先发后至的响应会覆盖后发请求的结果（无 abort/无 reqId 守卫），`!res.ok` 时 `detail` 保持上一条、无任何错误提示；`fetchList`（:126-137）用 `catch {} finally` 静默吞错。同类静默 `catch {}` 全仓库 47 处。
- **风险影响**：竞态导致「点 A 显示 B 的行程/花费」——在后台管理里会直接导致**改错对象**；静默失败让用户在空页面上反复重试；每个文件各写一套错误文案/凭据处理，行为不一致（有的 401 跳登录、有的空白）。
- **改进方案**：
  1. 以 codemod 分文件迁移：先迁 `app/admin/**`（12 个大页面，最需要一致性），再迁 `components/social/**`；`fetch(` 在白名单外由 lint 规则 `no-restricted-globals`/`no-restricted-syntax` 拦截（配 `// eslint-disable-next-line` 例外）。
  2. `apiFetch` 增加 `dedupe` 之外的能力：`method` 支持与缓存失效（写操作后 `__resetClientCache()`），避免迁移后写操作读到旧缓存。
  3. 用 `useApi` 替换 `fetchDetail` 模式（`useApi(`/api/admin/travels/${selected}`)` 天然带 abort/三态）。
  4. 验证：单测 `tests/unit/client-api.test.ts` 已有基础，补一个「快速切换 id，旧响应不覆盖新状态」的渲染测试。

### [🟡] P-7 两套服务层并存 + 18 个 API 路由直连 Prisma，校验/权限逻辑在协议层重复
- **位置**：`lib/container.ts:1-132`、`lib/modules/*`（16 个领域模块）、`lib/services/*`（10 个文件）、`app/api/**/route.ts` 统计见下
- **问题描述**：统计 118 个 `app/api/**/route.ts` 的 import：**84 个**直接引 `@/lib/modules/*`，**4 个**引 `@/lib/services/*`（`app/api/login`、`app/api/register`、`app/api/admin/login`、`app/api/dashboard`），**2 个**引 `@/lib/repositories/*`，**18 个**直接 `from '@/lib/db'` 用 `prisma` 写查询（如 `app/api/travels/[id]/photos/route.ts:2`、`app/api/travels/[id]/timeline/route.ts`、`app/api/images/[id]/route.ts`）。`lib/container.ts` 仍在注册 post/moment/like 等 10 个 service（`lib/container.ts:24-40` 是模块级单例变量 + 后续 `getXxxService()` 懒加载），与 modules 层职责重叠。协议层校验也散着：65 个路由调用 `request.json()`，仅 3 个文件用 zod（`lib/validators/{auth,post}.validator.ts` + `app/api/admin/posts/import/publish/route.ts`），58 个路由手写 `parseInt(id, 10)`。
- **风险影响**：可见性/权限规则在 modules 与直连 prisma 的路由里各写一遍，新增一种 visibility 就漏一处（改动记录里「列表看不到、直链能看」这类 bug 已出现过）；zod 覆盖率 3/118 意味着入参类型/边界靠手写 if，是 API 层 500 和越权的主要来源（安全问题另见安全模块）。新人无法判断「新接口该写 modules 还是 services」。
- **改进方案**：
  1. 明确一条规则写进 `docs/`：协议层只允许 import modules；新增 `lib/api/handler.ts` 统一 `withAuth(handler)` + zod schema（`parse(schema, await req.json())`），把 `request.json + parseInt + 401` 三件套收进包装器。
  2. 18 个直连 prisma 的路由按领域拆出查询函数下沉到对应模块（travels/photos、timeline 归 `lib/modules/travel`；images 归 `lib/modules/media`），协议层只做校验与响应。
  3. `lib/services/*` 标注为 legacy 并冻结（只允许改 bug 不许加功能），或把 container 注册的 service 统一迁到 modules 后删除该目录。
  4. 验证：加 ESLint `no-restricted-imports` 规则禁止 `app/api/**` import `@/lib/db`，从 18 个存量开始 `// TODO` 白名单递减。

### [🟡] P-8 错误响应与日志没有统一实现：116 处把 `error.message` 原样返回，结构化 logger 仅 4 个文件在用
- **位置**：`lib/infrastructure/logger.ts:8`、`app/api/**/route.ts`（统计：118 路由 112 个有 catch / 6 个无 catch；354 处 `NextResponse.json({ error`；116 处 `error.message`/`error?.message` 直接外泄）、`app/api/travels/[id]/route.ts:75`
- **问题描述**：错误出口至少四种形态并存：`{error:'未授权'}`、`{success:false,error}`、`ok()/fail()` 包装（34 个文件用 `lib/api-response`）、直接 500 空 body；文案里混着 Prisma 原始报错（`error.message` 透传 116 处），状态码也靠中文关键字猜（`app/api/travels/[id]/route.ts:75`：`msg.includes('不存在') ? 404 : 400`）。日志侧：`logger` 只有 4 个文件 import（`app/api/admin/settings/send-code/route.ts`、`app/api/admin/videos/upload/route.ts`、`components/album/space/galaxyEngine.ts`、`lib/modules/social/moderation.service.ts`），其余 80 处是 `console.error` 自由文本，无 requestId、无 userId、无耗时、无 level 过滤；6 个无 catch 的路由（如 `app/api/social/users/[id]/followers/route.ts`）异常直接冒泡成 Next 默认 500 HTML。
- **风险影响**：同一类失败在 App/Web 上提示不同、前端无法统一拦截（`isSessionExpiredError` 要靠字符串 `includes('登录')`，`lib/client/api.ts:32-37`）；Prisma 报错外泄会暴露表名/字段/查询细节；无 requestId 时线上排查只能靠时间戳翻日志。
- **改进方案**：
  1. 定义 `ApiError`（status + code + 用户文案）与 `errorResponse(err)` 单一出口，协议层 catch 一律 `return errorResponse(e)`；中文关键字判状态改成业务错误码（`TRAVEL_NOT_FOUND`）。
  2. 实现 `withApi(handler)`：生成 `requestId`（`crypto.randomUUID()`）、记录 method/path/status/duration、异常时 `logger.error('api', 'unhandled', {requestId, path, err})`，并在响应头回写 `x-request-id`。
  3. 前端 `apiFetch` 读取 `code` 做映射（替代 `includes('登录')`）。
  4. 验证：`grep -c "error.message" app/api` 目标降到 < 10；加一个测试断言未授权/不存在/校验失败三类响应 body 形状一致。

### [🟡] P-9 镜像与容器安全：全量 `/app` 拷进 runner（含 devDeps）、root 运行、无 HEALTHCHECK、构建上下文约 870MB、compose 默认弱口令
- **位置**：`Dockerfile:15-31`、`.dockerignore:1-13`、`docker-compose.yml:7,16-21,34-36,58-59,64-65`
- **问题描述**：
  - `Dockerfile:21` `COPY --from=base /app /app` —— base 阶段装了**全量 node_modules（1274.5MB，含 eslint/playwright/@lhci/cli/vitest/@capacitor/cli 等 devDeps）**，且把源码、tests、docs、scripts、www 一并塞进 runner；无 `USER` 指令（默认 root）；无 `HEALTHCHECK`。估算镜像 ≥1.5GB（未实际 build，见「未覆盖」）。
  - `.dockerignore` 只排除 node_modules/.next/.git/logs/.env/coverage 等，**未排除 `android/`（748.8MB）、`docs/`（21.9MB）、`www/`（20.5MB）、`.review-shots/`、`test-results/`**——构建上下文约 870MB，每次 `docker compose build` 都要打包传输。
  - compose 默认值可直接起服务：`MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-Abd123456.}`（:7）、`DATABASE_URL` 用 root 连接（:34）、`JWT_SECRET/SESSION_SECRET` 默认 `change-me-to-a-long-random-secret`（:35-36）、`COOKIE_SECURE` 默认 false（:38）；`ports: "${APP_PORT:-3000}:3000"`（:64-65）绑定 0.0.0.0；无 `logging:` 轮转、无 `deploy.resources` 限制、app 无 healthcheck；`APP_VERSION` 默认 1.0.0 / `APP_BUILD_NUMBER` 默认 1（:58-59）与真实 1.24.8/54 相差 24 个版本。
- **风险影响**：镜像臃肿拖慢部署（文档 :186 已记录 2C2G 服务器构建 OOM 风险，devDeps 与源码是主因之一）；root 容器 + 可写根文件系统扩大逃逸面；密码默认值一旦漏配 .env 就是「公网可登录的 admin」；`APP_VERSION` 默认值会让 OTA 把 App 判定为「1.0.0 有新版」，误触发全量强更弹窗。
- **改进方案**：
  1. 改多阶段：builder 装全量依赖 → `npm prune --omit=dev` → runner 只 `COPY --from=builder /app/.next/standalone` 与 `static/public`（Next `output:'standalone'`），或至少 `COPY --from=base /app/node_modules` 前执行 prune；加 `USER node`、`HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1))"`。
  2. `.dockerignore` 追加 `android`、`www`、`docs`、`.review-shots`、`test-results`、`site`、`data`、`deploy-backup`、`.pytest_cache`。
  3. compose 去掉所有弱默认值（改为 `${VAR:?must set}` 强制注入），端口改 `127.0.0.1:${APP_PORT:-3000}:3000`，加 `logging: driver: json-file, options: {max-size: "20m", max-file: "5"}` 与 `healthcheck`；`APP_VERSION`/`APP_BUILD_NUMBER` 默认值改由 `scripts/bump-version.cjs` 同步（见 P-13）。
  4. 验证：`docker build -t tn:test . && docker image ls tn:test`（目标 < 500MB）；`docker run --rm tn:test id` 应为非 root。

### [🟡] P-10 超大单文件：travel.service.ts 1083 行/34 个导出函数、admin/settings 1076 行、app/album 905 行——附具体拆分方案
- **位置**：`lib/modules/travel/travel.service.ts`（1083 行，45.6KB）、`app/admin/settings/page.tsx`（1076 行）、`app/album/page.tsx`（905 行）、`components/album/sketchbook/Sketchbook.tsx`（985 行）
- **问题描述**：
  - `travel.service.ts` 单文件里既有 Prisma include 树（:130-151 的 6 层嵌套 include）、DTO 映射（:159-203 手写 20+ 字段 return 对象）、业务规则（:449-496 slug、:656-708 按日期区间重排 day）、也有 4 个私有工具函数；最长函数 `getTravelTimeline`（:298-411，114 行）与 `listTravels`（:106-194，89 行）各自混了查询+映射+可见性策略。`as any` 在该文件出现 9 次（`where as any`，:131、:214）。
  - `app/admin/settings/page.tsx` 一个文件内联了 5 个完整 Tab 组件：`ProfileTab`(:171)、`PasswordTab`(:319)、`EmailTab`(:518)、`TravelTab`(:768)、`OilTab`(:951)，每个都自带 5-10 个 `useState` 与独立 `fetch` 逻辑，主组件（:12-170）还负责鉴权与路由。
  - `app/album/page.tsx` 的 `AlbumPage` 从 :93 到文件尾（约 810 行），同时承担取数、模式切换（普通/画册/像素/银河）、动态加载 4 个重型渲染器（:35-38）与 4 套 UI 分支。
- **风险影响**：改动任何一条规则都要通读千行文件，Code Review 只能看 diff 局部；`as any` + 手写映射让 Prisma schema 变更时编译器无法发现漏改字段；5 个 Tab 共用一份状态导致「改密码成功提示串到邮箱 Tab」这类耦合。
- **改进方案**（按收益排序）：
  1. `travel.service.ts` 拆 4 个文件：`travel.repository.ts`（所有 `prisma.travel.*` 查询 + include 常量）、`travel.mapper.ts`（`rowToSummary/rowToDetail` 两个纯函数，单测好写）、`travel.policy.ts`（`canManageTravel`、`spaceScopedWhere` 调用、slug 生成）、保留 `travel.service.ts` 做编排（每个函数 < 40 行）。目标：行数 < 350。
  2. `app/admin/settings/page.tsx` 拆成 `components/settings/{ProfileTab,PasswordTab,EmailTab,TravelTab,OilTab}.tsx` + `hooks/use-settings-auth.ts`；主文件只留 Tab 路由与共享 message 状态（目标 < 120 行）。密码强度 `evaluatePassword`(:330) 抽到 `lib/validators/password.ts` 并补单测。
  3. `app/album/page.tsx` 抽 `hooks/use-album-data.ts`（取数+轮询）、`components/album/AlbumModeSwitch.tsx`、`components/album/AlbumGalleryGrid.tsx`，主文件保留模式编排（目标 < 250 行）。
  4. 验证：拆完 `npm run typecheck && npm test` 全绿；对拆分出的 mapper/policy 补 5-8 条单测（当前 `tests/unit/travel-*` 已覆盖部分规则，可迁移复用）。

### [🟡] P-11 死代码与未使用依赖：sketchbook 目录 1086 行无任何引用、4 个组件死文件、`date-fns` 零引用
- **位置**：`components/album/sketchbook/Sketchbook.tsx:41`（985 行）、`components/album/sketchbook/spreads.ts`、`components/album/PolaroidWall.tsx:21`、`components/comments/CommentsSection.tsx:18`、`components/AccountSettings.tsx:8`、`package.json:37`（`date-fns`）
- **问题描述**：全仓库 import 检索（`app/components/hooks/lib/tests` + 动态 `import()`）显示：`Sketchbook.tsx` 只被自己的 `./sketchbook.css` 引用，无任何 importer；`PolaroidWall.tsx`、`CommentsSection.tsx`、`AccountSettings.tsx` 同样 0 importer。`docs/design/改动记录.md:3146` 自己记录了「死代码处置：`components/album/sketchbook/**`（约 30KB）、`PolaroidWall.tsx` 已无引用……待 Album 2.0 验收后单独一次删除提交」——即**已知残留但一直没删**。依赖侧：`date-fns`（`package.json:37`）在源码中 0 处引用（项目用的是自写 `formatDate`/`toLocaleDateString`）；`typescript`、`postcss`、`autoprefixer`、`tailwindcss` 4 个构建期工具放在 `dependencies`（`package.json:33,51,70,73`），使生产剪枝变得困难。
- **风险影响**：死文件被误改/误引用（新人看到「Sketchbook 相册」会以为在用）；`date-fns` 白占安装体积与审计面；构建期工具进 dependencies 让 `npm prune --omit=dev`（P-9 优化）不可行。
- **改进方案**：
  1. 单独一个 commit 删除 `components/album/sketchbook/`（含 css 与 spreads.ts）、`PolaroidWall.tsx`、`CommentsSection.tsx`、`AccountSettings.tsx`；删前 `npx tsc --noEmit && npm test` 验证（当前全绿，删除安全）。
  2. 移除 `date-fns`；`typescript/postcss/autoprefixer/tailwindcss` 移到 devDependencies（`next build` 需要它们，但 builder 阶段装全量即可）。
  3. 加一个轻量检查脚本 `scripts/check-unused.mjs`（`depcheck` 或自写：扫描 `from '<pkg>'` 与 `import('<pkg>')`），在 CI 的 report-only 步骤里输出未使用依赖清单。

### [🟡] P-12 测试真实覆盖度：554 用例真实但覆盖偏 lib、组件零渲染测试、无覆盖率配置、E2E 不在 CI 且 retries=1 掩盖抖动
- **位置**：`vitest.config.mts:11-19`、`playwright.config.ts:9-11`、`tests/`（53 个 unit + 7 个 security + 21 个 e2e spec）
- **问题描述**：本人实跑确认 60 文件/554 用例 22s 全绿，质量不虚；但它测的多是纯函数与离线存储（`tests/unit/offline-*.test.ts` 11 个、`book-*.test.ts` 6 个、`travel-*.test.ts` 11 个）。`vitest.config.mts` `environment:'node'`、`include:['tests/**/*.test.ts']`，**没有 jsdom/@testing-library，199 个组件文件没有任何渲染测试**；只有 9 个测试文件 import `@/app` 或 `@/components`（且多为 route handler 与纯 helper）。未配置 coverage provider 与阈值（`Select-String coverage vitest.config.mts` = 0）。E2E 21 个 spec 只能在本地/手工跑，`playwright.config.ts:11` 注释直说「dev 编译抖动大，保留 1 次重试」——这会掩盖真实不稳定。
- **风险影响**：真正的 UI 回归（React 渲染、hooks 依赖数组、状态竞态）只能靠 E2E；而 E2E 不进 CI，等于这类回归零防护。覆盖率不可量化时无法回答「这次改动的测试够不够」。
- **改进方案**：
  1. 装 `@testing-library/react` + `jsdom`，给 `useApi`、`AlbumPage` 的 4 个模式切换、`travel.service` 的 mapper 补 10-15 个组件/钩子测试（先覆盖 P-6 竞态与 P-4 降级）。
  2. `vitest.config.mts` 增加 `coverage: { provider:'v8', thresholds:{ statements:60, branches:50 }}`，CI 上传报告；每月按模块上调。
  3. E2E 进 CI（见 P-3），并拆 `@smoke` / `@full` 两档：PR 跑 5 个冒烟 spec，master 跑全量；CI 中 `retries:0`，把 flaky 当成 bug 修。
  4. 验证：`npx vitest run --coverage` 输出的 statements 百分比写入本文件回填。

### [🟡] P-13 版本/发布/Git 流程：487 提交全在 master、54 个 build 只有 1 个 tag、compose 的 APP_VERSION 不在校验范围、Node 版本三处不一致、脚本 52 个
- **位置**：`git tag --list`（只有 `v1.0.0`）、`git branch -a`（仅 master）、`scripts/bump-version.cjs:49-72`、`scripts/verify-version.cjs:42-52`、`docker-compose.yml:58-59`、`README.md:58`、`Dockerfile:3`、`package.json:85`、`scripts/`（52 个文件）
- **问题描述**：
  - 版本号四处一致（`package.json:3`、`lib/app-version.ts:5,8`、`android/app/build.gradle:17-18`、`scripts/build-mobile.cjs`），有 `bump-version.cjs` 负责改写、`verify-version.cjs` 负责校验——这是好实践。**但 `docker-compose.yml:58-59` 的 `APP_VERSION:-1.0.0`/`APP_BUILD_NUMBER:-1` 不在校验范围**，漏配 .env 时 `/api/version` 会返回 1.0.0/1（OTA 误判）。
  - Node 版本：`README.md:58` 写「Node.js 18+（推荐 20 LTS）」，`Dockerfile:3` 用 `node:22-bookworm-slim`，`@types/node` 是 `^20`（`package.json:85`），且 `package.json` 无 `engines`、无 `.nvmrc`、无 `packageManager`。
  - Git：54 次发版只有 `v1.0.0` 一个 tag，487 个提交全在 master、仅 1 个 merge commit，无 PR 流程、无分支策略、无 release 分支；最近 20 条提交里 18 条是 `feat-circle-interactions...`/`fix-album-flip...` 这种 dash 风格（历史 350 条是 `feat: ` 冒号风格），Conventional Commits 已被破坏，无法自动生成 changelog（现在靠手写 92KB CHANGELOG）。
  - `scripts/` 52 个文件中 13 个 `diag-*/verify-prod-*` 一次性诊断、12 个 `migrate-*/backfill-*` 一次性数据脚本；数据库 schema 演进有 3 套并行方案：`scripts/apply-schema-migration.cjs`（24.8KB 手写 DDL）、`npx prisma db push`（entrypoint:12）、`scripts/migrate-database.sh`（备份/恢复/迁移）。
- **风险影响**：出问题无法定位「线上是哪个 commit」；无法回滚到上一版本镜像（没有 tag）；版本号漂移直接触发移动端错误 OTA；新人无法判断哪套迁移脚本是权威。
- **改进方案**：
  1. 每次发版打 `git tag v1.24.8-b54` 并推送；`server-rebuild.sh` 用 `git archive <tag>` 打包（现在用的是 `HEAD`，见 `DEPLOYMENT.md:169`），镜像打 `tn:版本-build`，回滚 = 用旧 tag 重新 up。
  2. `bump-version.cjs` 的 edits 数组增加 `docker-compose.yml` 的 `APP_VERSION/APP_BUILD_NUMBER` 默认值；`verify-version.cjs` 增加「compose 默认值 == package ver」检查。
  3. `package.json` 加 `"engines": {"node": ">=20 <23"}`，根目录加 `.nvmrc`（22），`README.md:58` 同步改为「Node 22 LTS」。
  4. 提交规范二选一：恢复 `feat:`/`fix:` 并使用 commitlint + husky，或明确放弃并删除 CHANGELOG 手工维护约定；建议前者，配合 `standard-version` 自动生成 CHANGELOG。
  5. `scripts/` 分目录：`scripts/ops/`（部署/备份/清理）、`scripts/migrations/`（Prisma migrations 之外的归档）、`scripts/archive/`（diag/verify 一次性脚本，README 注明「仅历史参考」）；`migrate-database.sh` 只保留 backup/restore，schema 变更统一到 prisma migrations。

### [🟢] P-14 类型债务可量化：268 处 `: any`、93 处 `as any`、`types/` 只有 1 个 22 行文件
- **位置**：`tsconfig.json:2-23`、`types/node-sqlite.d.ts`（唯一文件，22 行）、`lib/types.ts`（8 行）、`: any` 分布 app 120 / lib 128 / components 20
- **问题描述**：`strict:true` 是真的，`@ts-ignore/@ts-expect-error/@ts-nocheck` 全仓库 0 个（好）；但 `no-explicit-any` 只配成 warn，实测 `:any` 268 处、`as any` 93 处、`as unknown as` 12 处；`tsconfig` 未开 `noUncheckedIndexedAccess`，`target` 仍是 `es5`（对 Next 15/SWC 无实际作用，纯误导）；公共类型分散在 `lib/types.ts`（8 行）、`lib/modules/*/types.ts`（2 个）、各组件内联 interface，`types/` 目录只剩一个 SQLite 声明文件。
- **风险影响**：`as any` 是 Prisma 自定义适配器与 `where` 组合的主要逃生口（`travel.service.ts:131`、`:214`），字段改名时编译器沉默；`noUncheckedIndexedAccess` 未开让 `arr[0].field` 这类代码在 strict 下仍是「安全」的假象（相册分页越界正是这类）。
- **改进方案**：
  1. 每次 PR 只允许 `as any` 数量不增加：CI 加 `grep -r "as any" | wc -l` 基线（当前 93）并 `--max-warnings` 同步收紧。
  2. `tsconfig` 开 `noUncheckedIndexedAccess`，先只对 `lib/modules` 生效（`tsconfig.modules.json` 子项目），逐目录修。
  3. 建 `types/domain.ts` 收敛 Travel/Memory/Media/Space 的公共 DTO（现在 `lib/types.ts` 8 行、其余散在模块内），与 Prisma 生成类型分离。

### [🟢] P-15 `next.config.js` 的图片域名放开为 `**`，且注释与现状不符
- **位置**：`next.config.js:9-18`、`next.config.js:20-24`
- **问题描述**：`images.remotePatterns` 为 `{protocol:'https', hostname:'**'}`，任何 HTTPS 域名都可经 `next/image` 优化器代理拉取；`next.config.js:20` 注释写「项目未配置 ESLint」，但 `.eslintrc.json` 明明存在（配置注释已过时）。
- **风险影响**：`/_next/image?url=https://任意域名` 使服务端成为开放图片代理（带宽/缓存/SSRF 面），且难以做防盗链；过时注释会误导后续维护者再次跳过 lint。
- **改进方案**：把 hostname 限定为实际媒体源（COS 域名 + 站点域名，如 `*.cos.ap-guangzhou.myqcloud.com`、`travel-notes.yuanabd.cn`）；若媒体 URL 动态且无法枚举，改成 `unoptimized` 并删掉远程优化；同时修正 :20 注释为「lint 在 CI 单独执行，构建期跳过以省内存」。

## 优势（有证据）

1. **类型检查是真的干净**：`npx tsc --noEmit` exit 0 无输出；全仓库 `@ts-ignore/@ts-expect-error/@ts-nocheck` 共 0 处；`strict:true` 生效。对比 0 个 ts-ignore 与 268 个 any，说明团队用 any 兜底而不是靠抑制注释，至少是「可搜可治理」的债务形态。
2. **单测不是摆设**：实跑 60 文件/554 用例 22s 全绿，且是真业务：离线 SQLite 同步引擎（11 个 offline-* 用例）、画册 composer/paginate/flip-runtime、权限与 csrf/路径穿越（`tests/security/` 7 个）、金额分/元换算（`money.test.ts`）。CI 也确实跑 `npm test`（`.github/workflows/ci.yml:47`）。
3. **分层目录与 DI 有清晰设计意图**：`lib/modules/` 17 个领域模块 + `lib/repositories/` 仓储 + `lib/infrastructure/` 基础设施 + `lib/container.ts` 显式单例装配；`lib/client/api.ts` 的 `apiFetch` 处理了 `redirect:'manual'` 会话失效、并发去重、内存缓存，并配 `tests/unit/client-api.test.ts`/`client-api-redirect.test.ts` 回归——这是本次评审里少见的「为真机 bug 写成基础设施 + 测试」的闭环。
4. **部署脚本有工程化意识**：`scripts/disk-clean.sh` 明确不碰 `docker volume prune`、`server-rebuild.sh:15,32-38` 有最小可用空间闸门（`MIN_FREE_MB=8000`）、`DEPLOYMENT.md:177-180` 复盘了 2026-09-15 containerd 泄漏事故并写成脚本化步骤——这些是真实事故换来的防御，值得保留（本次建议只是在其上补测试与回滚）。
5. **可观测性有起点**：`/api/health` 做了 DB ping 且失败返回 503（`app/api/health/route.ts:15-31`）；`lib/infrastructure/logger.ts` 已经是 JSON 行结构化日志（ts/level/module/event），只差推广；`app/api/admin/settings/send-code` 等 4 处已在用。

## 未覆盖/待确认

- **E2E 未跑**：21 个 Playwright spec 需要本地 MySQL + `next build` + 3111 端口，本机无运行中服务且构建耗时长（配置 webServer timeout 300s），只做了静态审查；E2E 的实际稳定性/flaky 未验证。
- **Docker 镜像未实际构建**：本机未执行 `docker build`（体积/耗时不划算），镜像体积为 `/app` 目录体积推算（node_modules 1274.5MB + .next 1132MB，standalone 模式下远小于此），具体数值待有 Docker 环境时核验。
- **npm audit 漏洞可达性未逐条分析**：43 个漏洞里 `@lhci/cli`/`eslint-config-next` 属 devDeps（生产镜像若 prune 后不可达），但 `nodemailer`（`package.json:49`，运行时）、`mysql2`、`next`(postcss) 在生产路径上；是否被实际调用需结合代码路径逐个确认，建议安全模块复核。
- **覆盖率数字缺失**：`@vitest/coverage-v8` 未安装，安装会改 `node_modules`（违反只读约定），故只给出测试数量与结构分析，未给 statements/branches 百分比。
- **线上运维状态未核验**：无服务器访问权限，无法确认线上 crontab 是否真的加了 `DEPLOYMENT.md:145` 的备份条目、Uptime Kuma 是否在监视、日志是否被采集；P-5 的结论是「仓库侧无实现、无法审计」。
- **`lib/prisma-adapter.ts`（528 行）自定义适配器的正确性与性能**留给模块 3（API与数据）/模块 5（性能）深入；本文只就其 `as any` 使用（5 处）记为类型债务。
- **Git 提交历史风格统计**为抽样（最近 20 条）与总量正则匹配（350 条 colon 风格），未逐条人工分类。
