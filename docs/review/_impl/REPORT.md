# P1 / P2 整改实施报告（2026-10-18）

> 依据：docs/review/行迹-全维度评审报告-2026-10-18.md 第 4 章 P1（10–25）/ P2（26–36）整改清单。
> 实施方式：5 条并行实施线（安全/API、数据层、Web、移动端、工程化）+ Lead 集成验证；品牌同时由「行迹」更名为「甜途」。
> 本文件记录**已完成 / 部分完成 / 明确 deferred**，以及上线前必须知道的部署变更。

## 0. 提交批次（git）

1. docs-add-full-audit-report —— 评审报告与 5 份审计明细
2. feat-rename-brand-to-tiantu —— 行迹 → 甜途（Web/移动端用户可见文案、metadata、manifest、邮件、导出文件名等）
3. 安全/API P1（本批）
4. 数据层 P1（本批）
5. Web 性能/UI P1（本批）
6. 移动端 P1/P2（本批）
7. 工程化 P1/P2（本批）
8. docs 实施报告

## 1. 品牌更名：行迹 → 甜途

- 用户可见：app/layout metadata、登录/注册/找回密码、Navbar/Footer/BrandLogo、首页双树、后台（AdminShell/login/内容中心/空间）、下载页、导出 ZIP 文件名与 app 字段、邮件标题、PWA manifest、ICP 备案说明、RSS 标题兜底。
- 未改：JWT issuer（'travel-notes'，改了会让全部会话失效）、域名/URL、npm 包名、数据库名等内部标识。
- 测试同步：tests/e2e/browse.spec.ts 的品牌断言改为「甜途」。

## 2. P1 完成情况

| # | 项 | 状态 | 关键落点 |
|---|---|---|---|
| 10 | 会话撤销统一 + fail-closed + App 会话续期 | ✅ | lib/session.ts（唯一校验入口，无 sid 即拒绝）；lib/current-user.ts、lib/auth-middleware.ts 全部回查 DB；DB 异常返回 503 不再 JWT-only；App TTL 365d→90d；/api/check-auth 剩余<30d 静默续期 + DB extendExpiry；Cookie 属性抽 sessionCookieOptions 三处共用 |
| 11 | XFF 伪造 | ✅ | getClientIp = X-Real-IP → XFF 最后一段 + IP 粗校验；nginx 模板改 X-Forwarded-For $remote_addr；单测覆盖伪造首段 |
| 12 | 密码策略 | ✅ | validatePassword（≥8 + 36 弱口令 + 单字符重复）全链路复用；bcrypt cost 12；忘记密码去枚举；客户端提示同步「至少 8 位」 |
| 13 | CSRF/CORS/密钥 | ✅ | Origin:null + Sec-Fetch-Site:cross-site → 403（Capacitor 兼容）；CORS 完整 origin 白名单 + App 壳 origin 生产始终放行；生产 COOKIE_SECURE 告警；lib/jwt-secret.ts 拒绝占位/弱密钥（生产 fail-fast） |
| 14 | 匿名纪念日 | ✅ | /api/anniversaries 匿名只回 isPublic；新增 /api/anniversaries/seal（仅 month/day）；LoginDoor 切到 seal |
| 15 | 多表写事务化 | ✅ | createTravel/updateTravelInfo/updateTravel/deleteTravel、updateSocialPost 全部 $transaction；syncTravelPost/publish/unpublish 支持可选 tx；静默 catch 改带上下文 console.error |
| 16 | 索引 | ✅（需部署生效） | SpaceMember[userId,status]/[username,status]、Media[storageKey]、Memory[travelId]、Album[travelId]；仓库无 migration 历史，部署时 prisma db push 生效 |
| 17 | zod + 统一错误 | ◐ 15 条核心写路由 | lib/api/handler.ts（withAuth/parseBody/requestId）、ApiError/errorResponse；其余路由未改造（见 deferred） |
| 18 | 首页 SSR | ✅ | lib/home/home-data.ts 抽取；app/page.tsx 改 async Server Component；components/HomePageClient.tsx 双树 CSS 断点 + initialData 直出；/api/home 响应不变 |
| 19 | 动态加载 | ✅ | PhotoChatView/ParticlePhotoBackground/ChinaMap dynamic；全局浮层收敛 LazyOverlays；HomeMobile 抽屉拆出懒加载 |
| 20 | 错误兜底 | ✅ | app/error.tsx、global-error.tsx、not-found.tsx、components/ErrorBoundary.tsx；album 5 个动态渲染器包边界 |
| 21 | metadata/OG | ✅ | layout metadataBase/title.template/openGraph/twitter/canonical；circle/[postId]、travel/[slug] generateMetadata |
| 22 | 移动端账号隔离 | ✅ | meta.accountId 方案（老库首次认领不清库、离线取不到账号不清库）；登出停引擎+清 12 表+删媒体+关连接；本地读/merge 均校验归属 |
| 23 | 同步失败收敛（客户端） | ✅ | QueueStatus.DEAD；4xx(除 408/429)永久失败；retryCount≥8 转 DEAD；单轮≤20；AbortSignal.timeout(20s)；入队生成幂等键 + Idempotency-Key |
| 24 | 本地写原子性/对账 | ✅ | 改「先入队再写行」；启动对账补建缺失队列项；SYNCING >10min 回收 |
| 25 | CI 门禁 | ✅ | lint warning 预算 488；coverage 阈值（49/44/49/51）+ artifact；e2e-smoke job（5 spec/17 用例，CI retries=0）；audit allowlist 精确门禁（到期红线）；构建 env 注入 JWT/SESSION（Lead 集成补） |

## 3. P2 完成情况

| # | 项 | 状态 | 关键落点 |
|---|---|---|---|
| 26 | APK 裁剪 | ✅ | R8 + shrinkResources + proguard keep + abiFilters（arm64-v8a/armeabi-v7a）；缺 keystore 时 release 硬失败；**APK 26,327,901 B → 16,787,826 B（-36.2%）** |
| 27 | 图片/字体 | ◐ | next/image remotePatterns 可配置白名单 + avif/webp；Zpix font-display 已有 swap；字体子集化、裸 img 补齐、public 瘦身 deferred |
| 28 | 对比度 + 弹层焦点 | ◐ | token 值修正（faint 1.97→4.94、sand 4.16→4.94、shell-faint 3.38→5.93 等）；Modal/PhotoViewer/ExportArchiveDialog 接 useModalLayer；ink/70 档位需改 class（deferred） |
| 29 | 移动首屏 | ✅ | 同步引擎延迟 2s + 首轮 skipPull；首页快照写端 + 客户端读端兜底；pull 带 updatedSince 且全类型成功才推进游标 |
| 30 | OTA 完整性 | ✅ | /api/version 增 sha256/size/minSupportedBuild/rolloutPercent；原生下载流式 SHA-256 校验；灰度与强制更新；/api/diagnostics + 全局错误上报（限流、不写库） |
| 31 | token 收敛 | ◐ | admin 16 处硬编码 hex 换 token；大范围三层化 deferred |
| 32 | 大文件拆分 | ◐ | travel.service 1162→830 行，抽出 travel.types/mapper/policy；admin-settings/album 页面拆分 deferred |
| 33 | Docker/Compose | ✅（未实构建） | 三阶段 Dockerfile + npm prune + USER node + HEALTHCHECK；.dockerignore 瘦身；compose 占位密钥、回环端口、日志轮转、app healthcheck |
| 34 | 版本单一来源 | ✅ | engines/.nvmrc；bump/verify 覆盖 compose 默认版本与构建号 |
| 35 | Prisma 适配器生命周期 | ✅ | 移除构造期信号/process.exit；instrumentation.ts（edge 安全）+ instrumentation.node.ts；db.shutdownPrisma() |
| 36 | 依赖治理 | ◐ | mysql2 3.23.1→3.24.6；nodemailer 需 major 不动；dependabot 分组；audit 43 条分类与 allowlist 到期机制 |

## 4. 验证结果（2026-10-18 22:28–22:35 实跑）

| 门禁 | 结果 |
|---|---|
| npx tsc --noEmit --incremental false | exit 0 |
| npx vitest run | 68 文件 / 634 用例全绿 |
| npx vitest run --coverage | 通过（statements 50.61 / branches 45.03 / functions 50.19 / lines 52.39，阈值 49/44/49/51） |
| npm run lint -- --max-warnings=488 | 0 errors / 488 warnings（预算内） |
| npm run tokens:check | 无新增回退（308/399） |
| node scripts/audit-gate.cjs | exit 0（high/critical 全命中未过期豁免） |
| node scripts/verify-version.cjs | 全过（含 compose 1.24.8/54） |
| SKIP_DB_ON_BUILD=1 npx next build | exit 0；/ 为动态渲染，First Load JS 152 kB（评审基线 240KB gz）；首屏无 three/GeoJSON/motion chunk |
| gradlew assembleRelease | BUILD SUCCESSFUL（R8 实际执行） |

## 5. 上线前必须知道的部署变更

1. **JWT_SECRET/SESSION_SECRET**：必须 ≥32 字符且非占位值，否则生产启动即失败（openssl rand -hex 32）；改密钥会让现有会话全部失效。
2. **CORS**：App 本地壳 origin（https://localhost、capacitor://localhost）代码内始终放行；自定义域名/端口写 CORS_ALLOWED_ORIGINS（完整 origin，逗号分隔）。
3. **Nginx**：X-Forwarded-For 必须用 $remote_addr 覆盖，不能透传客户端自带 XFF（否则限流可绕）。
4. **数据库索引**：本次仅 schema 增加索引，部署时需 prisma db push 生效（无 migration 历史仍是遗留风险，建议 P0 一并处理）。
5. **Docker 非 root**：容器内 uid=1000，宿主机 /data/travel-notes/uploads 需 chown 1000:1000，否则上传/转码 EACCES。
6. **compose 占位符**：__SET_*_IN_ENV__ 未替换会导致启动失败（这是有意的 fail-fast）。

## 6. 明确 deferred（本轮不做，需后续排期）

- P1-17 剩余 API 路由的 zod 化（本轮 15 条核心写路由）。
- P2-27 字体子集化/woff2、裸 img 补 lazy/尺寸、public 大图迁移（需设计/素材决策）。
- P2-28 ink/70 等透明度档位改 class（需跨模块批量改，单独一批）；全站 WCAG 2.2 扩面。
- P2-31 设计 token 三层收敛（travel/shell/warm 三套并存）。
- P2-32 admin/settings、app/album 页面拆分；space-travel repository 事务透传；TravelPost 软下架。
- P2-36 next/prisma 大版本升级与 nodemailer 10.x。
- 服务端消费 clientMutationId 去重、sync 增量端点（客户端已留 Idempotency-Key 与 updatedSince 口）。
- 媒体上传压缩/断点续传/本地文件 LRU（M-8）。
- E2E 与 Docker 实跑（本机无 MySQL/Docker，已在 CI/部署环境留验收命令）。

## 7. 仍属 P0（本轮按用户要求只做 P1/P2，未动）

- **force-change-password 仍可被任意登录用户改「第一个用户」密码**（注册即可接管站长）——最高优先，建议立即删除/加固。
- 能力模型「无空间成员 = OWNER」仍成立（新注册用户可读全站审计/治理他人内容）。
- /api/upload 与 /api/images/[id] 的归属/可见性校验未加。
- 相册解锁仍无限流（P1-13 的限流只做了通用登录/IP，未覆盖 verify-album-password）。


---

# 附：P0 整改（2026-10-18 第二批）

> 响应「把 P0 也执行掉」。P0 条目见评审报告 §4 P0 表（1–9）。本批次提交后，评审中的两条账号接管链均已关闭。

## P0 完成情况

| # | 项 | 状态 | 关键落点 |
|---|---|---|---|
| 1 | 相册令牌不能当会话 | ✅（P1-10 已完成 + 本批回归测试） | requireAuth 强制 DB 会话（无 sid 即 401）；新增 tests/security/auth-regression.test.ts 5 例钉死 |
| 2 | 改密端点（账号接管） | ✅ | 删除 app/api/admin/force-change-password 整目录；移除白名单与 auth.ts/repo/auth-service 中对应方法；admin/change-password 改走 /api/admin/settings/password（旧密码 + 本人） |
| 3 | 权限默认值反转 | ✅ | User.siteRole（默认 USER）+ lib/site-owner.ts（CAS 幂等提升首个主人）；capabilities：social/settings/audit 仅站点主人、canManageSpace=主人或空间 OWNER、canManageContent 保持 true；bind-email 传 username；settings 自服务字段去掉主人能力位但保留旧密码/验证码校验；site-service 写路径严格按 username |
| 4 | 上传/图片归属与可见性 | ✅ | imageService.upload/delete 增加 actor 归属校验；/api/images/[id] 按 Post.published/isPublic/作者/主人判定，私有图不再 immutable；/meta 可见性同口径 + EXIF 白名单（去掉 GPS/机型/曝光）；admin import/video 站点级路由仅站点主人 |
| 5 | 相册解锁限流 | ✅ | /api/verify-album-password：IP 10/15min + 全局 30/15min + 失败指数退避（60s→30min）+ 成功清锁 |
| 6 | 注册开关 | ✅ | REGISTRATION_ENABLED=false → /api/register 403 |
| 7 | 发布门禁 | ✅ | Dockerfile builder 内 prisma generate → typecheck → lint（预算 486）→ test，失败即镜像失败；server-rebuild.sh：备份闸门（<26h）→ 记录 previous 镜像 → curl -fsS 轮询 60s → 失败打日志并 exit 1 |
| 8 | 迁移基线 | ✅（未实跑 DB） | prisma/migrations 两条：20261018000000_init（P1 前 schema，34KB）+ 20261018120000_p1_indexes_and_site_role（siteRole + 6 索引）；migrate-bootstrap.cjs 三分支兼容存量库；entrypoint 改 migrate deploy（set -e）；CI 改 migrate deploy + drift 门禁（shadow DB 走 prisma.config.ts 的 SHADOW_DATABASE_URL） |
| 9 | 备份与恢复 | ✅（未实跑 Docker） | scripts/backup-db.sh（mysqldump --single-transaction --routines → gzip -9 + gzip -t + 30 天 prune + 可选 rclone；--check/--verify/--list）；crontab 每日 02:30；server-rebuild 部署前检查最近备份 <26h |

## 验证（P0 批次）

- tsc --noEmit → exit 0
- vitest run → 76 文件 / 679 用例全绿（+45）
- lint --max-warnings=486 → 0 error
- coverage 52.4/46.13/51.01/54.37（阈值 51/45/50/53）
- prisma validate 通过；migration 重生成哈希一致；shellcheck 对 3 个 shell 脚本 0 findings
- next build 与 Docker/E2E/备份恢复未实跑（本机无 MySQL/Docker；见下）

## P0 遗留 / 上线前必须确认

1. **存量生产库首次升级**：先跑 `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` 核对漂移，再让 entrypoint 执行 bootstrap（resolve 基线）+ deploy（应用 siteRole/索引）。若历史 db push 已加过这些对象会失败，需人工核对。
2. **CDN/浏览器缓存**：旧版对 /api/images/[id] 发过 1 年 immutable，已缓存的私有图需手动刷缓存。
3. 站点主人提升：首个访问能力检查（或 /api/me/capabilities）时自动把 id 最小用户设为 SITE_OWNER；如需指定他人，手工 `UPDATE User SET siteRole='SITE_OWNER' WHERE ...` 并清理另一条。
4. 管理员页面仍可被普通用户打开（API 已 403）；如需要页面级收口可后续加 layout 守卫。
5. 本机未安装 bash/WSL：shell 脚本用 shellcheck 做语法级校验，未真实执行；Docker 镜像与 CI 是首次真实验证点。


---

# 附二：最后一批 deferred 收口（2026-10-19）

> 响应「P1-17 其余 API 的 zod 化；P2-27 字体子集化/裸 img/public 瘦身；P2-31 token 三层化；P2-32 后台/相册页面拆分 都完成掉」。

## P1-17 zod 化：全量收口

- 写路由覆盖：**107/107 个写 handler**（POST/PUT/PATCH/DELETE）均有 schema 校验或显式 reviewed-no-body-input；残留 0。
- 本批新增：`lib/api/schemas/{common,travel,space,memory,social,admin,me}.ts`；35+29 个 route 文件改造（A 线 37 个方法、B 线 41 个方法）。
- 统一规则：数字 id/page 用 `z.coerce.number().int().positive()`；失败统一 `{success:false,error,code,requestId}`；multipart 路由按表单字段校验（不套 JSON parseBody）；无 body 的 DELETE 用路径/query schema + `reviewed-no-body-input` 注释。
- 兼容：成功响应/状态码不变；update 类不加「至少一字段」refine；邀请 role/有效期等原有归一语义保留。
- 新增测试：`write-routes-zod.test.ts`（14 例）、`api-write-routes-zod-b.test.ts`（21 例）。

## P2-27 字体 / 裸 img / public 瘦身

| 资产 | 前 | 后 | 变化 |
|---|---|---|---|
| zpix 字体 | 7,179,288 B TTF | **287,164 B WOFF2** | **-96.0%** |
| logo.png | 2,054,864 B | 923,139 B | -55.1% |
| logo-512.png | 264,291 B | 75,360 B | -71.5% |
| pixel_bg_cabin（实为 JPEG） | 770,371 B | 99,892 B WebP | -87.0% |
| 登录视频 poster | — | 4,777 B 新增 | preload=none 保留 |
| public 合计 | 77.10 MB | **68.67 MB** | **-8.43 MB** |

- 字体子集 = 仓库源码全量字符 + GB2312 6763 字 + ASCII/标点（7538 字形），`font-display:swap` 保留；`public/zpix.ttf` 删除。
- 21 处裸 `<img>` 补 `loading/decoding/width/height`（object-cover 填充型不猜尺寸）。
- 登录视频用 sharp 生成品牌 poster，蜂窝网络不再直接黑屏。

## P2-31 设计 token 三层化（视觉零变化）

- 新增 `app/tokens.css`（1217 行）：L1 `--palette-*` 281 条 → L2 `--ui-*` 397 条 → L3 `html.dark` / `[data-space]` / `[data-skin]` → legacy 别名 345 条；`globals.css` 2634→2314 行、`mobile.css` 1625→1420 行，**组件 class 零改动**。
- `tailwind.config.js`：shell/pixel 改 RGB 通道变量（保住 72 处 /opacity）、删除与 `--social-*` 暗色完全重复且 0 引用的 `night.*`、其余标 deprecated。
- **视觉零变化证据**：`scripts/check-token-parity.mjs` 逐条比对 legacy 变量最终字面值，**345/345 相等、0 不等**（root 179、dark 86、space 5 类 ×8×2）。
- checker 新增第 12 条 `legacyTokenNewUsage`（只拦新增），基线 308/399 → 307/798（400 处存量冻结）；`tokens:check` exit 0。
- 新增 `npm run tokens:parity` 并接入 CI（视觉回归守卫）。
- 代价（如实记录）：三层声明使全站 CSS gzip 43.4→46.8KB（+3.4KB），可用构建期生成别名层回收，列为后续优化。

## P2-32 后台 / 相册页面拆分

| 文件 | 前 | 后 |
|---|---|---|
| `app/admin/settings/page.tsx` | 1091 行 | **120 行** |
| `app/album/page.tsx` | 920 行 | **276 行** |

- 后台：拆出 `components/settings/{ProfileTab,PasswordTab,EmailTab,TravelTab,OilTab,fields,EmailStatusCard,types}` + `hooks/use-settings-auth.ts`；`evaluatePassword` 抽到 `lib/validators/password.ts` 并复用服务端 `validatePassword`（强度提示与服务端同源，不做前置拦截）。
- 相册：拆出 `hooks/use-album-data.ts` + 10 个子组件（Header/Bookshelf/UnlockScreen/SpaceMode/PhotoWall/ModeSwitch/GalleryGrid/CoverBanner/StarMapOverlay/筛选纯函数）；5 个渲染器保留 dynamic + ErrorBoundary，book/space/pixel 分支与 URL/localStorage 行为逐项保持。
- 纯重构：请求路径/参数/文案/状态机不变；新增 `password-strength.test.ts`（9 例）、`album-gallery-filters.test.ts`（6 例）。
- 图标统一走 `@/lib/mobile/icon-system`（追加 13 个 re-export），lucideImport 91→90。

## 本批验证（最终共享树，实跑）

- `tsc --noEmit --incremental false` → exit 0
- `vitest run` → **80 文件 / 729 用例全绿**
- `lint --max-warnings=486` → 0 error / 451 warning（低于预算）
- `tokens:check` → exit 0（307/798）
- `tokens:parity` → PASS 345/345
- `audit-gate` → exit 0；`verify-version` → 通过
- `SKIP_DB_ON_BUILD=1 next build`（清空 .next 后重建）→ exit 0，84/84 静态页

## 说明

- 根路由 `/` 在共享树 build 中为 Dynamic：这是 P1-18 首页 SSR（cookies()）的预期结果，不是本批回归。
- `components/album/**` 在 token checker 第 12 条规则中豁免（Album 2.0 自有受控暗色主题）。
- 剩余未迁移：legacy 消费端 400 处 `--album-*/--social-*/--space-*`（已冻结基线只拦新增）、Tailwind travel/album/warm/primary 仍 hex（需 RGB 通道方案）、移动端旧 `www/` 与 Android assets 内的旧字体副本（下次移动端构建清除）。
