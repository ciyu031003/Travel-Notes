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


---

# 附三：移动端真机 bug 修复 + C1 安全加固 + 1.24.9 / b55 重打包（2026-10-19）

## 1. 真机严重 bug：半屏抽屉所有入口都回首页

**现象**（1.24.8 真机）：我的页右上角「记录与设置」半屏抽屉里，我的旅行/画册/时间线/碎碎念/数据看板/收藏/旅行圈/通知/同步/账号设置等全部"可点但都跳到首页"。

**根因（两层，均已实测复现）**：
1. **Capacitor Html5Mode**：`android/.../WebViewLocalServer.java:425` 对「最后一段不含点」的路径一律回退 `index.html`。抽屉入口用的是原生 `<a>` 整页跳转，点击 `/dashboard` 时 WebView 直接加载首页 —— 这是"都回首页"的直接原因。
2. **弹层历史回退竞态**：抽屉打开时 `useCloseOnBack` 压入一条同 URL 历史；点击入口后抽屉关闭（cleanup 执行 `history.back()`），而 Next 路由是异步的，未完成的导航被 back 顶回原页 —— 即使改成客户端路由也会"点了没反应"。

**修复**：
- `components/mobile/SideDrawer.tsx`：抽屉链接改为拦截普通左键 → 先 `markOverlayNavigation()` → `router.replace(href)`（用 replace 消费抽屉压入的重复历史项，返回键仍回到当前页）；修饰键保留浏览器原生行为。
- `hooks/use-close-on-back.ts`：新增导航标记导出；cleanup 时若 10s 内发生过显式导航、或路由已变，则**不再 history.back()**（避免把新路由顶掉）。
- `app/page.tsx`：为 `output:'export'` 增加 MOBILE_EXPORT 静态分支（壳内无服务端运行时；Web 仍走 cookies() 动态 SSR），否则移动端构建会因 `force-dynamic` 直接失败。

**验证（模拟 Capacitor html5mode 的静态服务器 + Playwright，390×844）**：
`tab->/me ok` → `drawer->/dashboard ok` → `drawer->/timeline ok` → `back->/me ok`（修复前 drawer 点击后 URL 停留在 /me）。该 harness 未入库，仅作本次验证。

## 2. C1 移动端安全加固

| 项 | 落点 |
|---|---|
| 禁止明文 | `usesCleartextTraffic=false` + `network_security_config.xml`（base 禁明文、仅 system 根证书）+ `allowMixedContent=false` |
| 禁止备份外流 | `allowBackup=false` + `fullBackupContent=false` + `data_extraction_rules.xml`（cloud-backup/device-transfer 全排除） |
| SQLite 加密 | `SecureStorePlugin.java` 用 AndroidKeyStore AES/GCM 保管 32B 随机口令（落盘仅密文+IV）；`sqlite-db.ts` 加密连接 + 明文库迁移（exportToJson → 备份落盘 → 删库 → importFromJson → 逐表行数校验；失败回滚明文、回滚失败保留备份）|
| 真实隐私锁 | `privacy-lock.ts` 重写（4–8 位 PIN + 随机盐 + SHA-256 + 会话语义）；`PrivacyLockGate.tsx` 冷启动全屏门禁；SyncCenter 开关要求设置/验证 PIN；“开关=开但无 PIN”的假状态自动修复 |

**验证**：tsc 0；vitest 82 文件/740 用例全绿（+11）；`gradlew assembleRelease` BUILD SUCCESSFUL；合并后 APK manifest 四项属性核验通过；R8 后 SecureStorePlugin 未被裁剪（mapping.txt）。

## 3. 移动壳瘦身与重打包（1.24.9 / build 55）

- `scripts/build-mobile.cjs`：删除 `www/uploads` 全目录（此前只删 media）与动态路由占位页（travel/placeholder、space/placeholder、circle/0、circle/user/0）；补 `NEXT_PUBLIC_SITE_URL` 让 images 白名单不退化。
- `www` 体积：20.5MB → **13.6MB**；APK：16,787,826 B → **14,635,024 B（-2.15MB / -12.8%）**，SHA-256 `9019a6a4ac0235cf448bb7ae46941176702d3ce7e5f5646ee1d5d130ad7fc529`。
- 版本：1.24.8/54 → **1.24.9/55**（包名 com.tiantu.app，label 甜途；签名证书 MD5 `f67e57f3…` 与历史一致）。
- APK 内容核验：`assets/public/zpix.woff2` 存在、`zpix.ttf` 不存在、无 `uploads/`、无动态占位页、无旧资源引用；`capacitor.config.json` 中 `allowMixedContent=false`、`androidIsEncryption=true`。
- Web 构建 `next build` 复验 exit 0（首页仍为动态 SSR）。

## 4. 仍需真机/发布确认

1. **明文库→加密库迁移**必须真机验证：覆盖安装（已有明文库）→ 杀进程 → 重启，确认数据完整、`数据与同步` 页显示"已加密"；异常时按报告回滚路径处理。
2. `allowBackup=false` 会阻止本地离线缓存随系统备份/换机迁移（云端数据不受影响）——产品需确认。
3. PIN 暂无失败次数节流（数据库由 Keystore 密钥保护，PIN 只是 UI 门禁），建议下批加退避。
4. APK 尚未发布到下载地址；发布时同步更新服务端 `APP_VERSION=1.24.9` / `APP_BUILD_NUMBER=55` / `APP_CHANGELOG` 与 `downloads/tiantu.apk`。
5. 服务器/CI 首次运行仍需按前文验证（migrate/backup/E2E）。


---

# 附四：剩余实施项收口（2026-10-19 · 1.25.0 / build 56）

本轮把此前 A/B/P3 剩余项全部处理（除确需外部环境/产品决策的条目，见文末）：

## B4 离线同步闭环
- 服务端：ClientMutation 幂等表 + Idempotency-Key（5 个创建端点）；SyncTombstone 墓碑（travel/moment/album/memory 删除写入）；GET /api/sync/changes（ISO/毫秒游标、可见性裁剪、limit 500、serverTime 先行、private no-store）。
- 客户端：pullChanges 优先增量、404/失败回退全量；pullIncremental 应用实体+墓碑（PENDING_UPLOAD 保留、不误删 media）；游标仅在全部成功后推进。
- 迁移：20261019190000_sync_idempotency_and_tombstones（2 表 + 4 索引）用旧/新 schema diff 生成；测试 29 例。

## B5 媒体管线
- 上传前 Canvas 压缩（1600/q0.82，高清 4096/q0.9，GIF 不重编码）、缩略图、本地命名约定（原图/缩略图/远端缓存）与 400MB LRU；上传成功删原图、保留缩略图；入队 payload 去 thumbBase64。
- 大图（>2MB）分片续传：app/api/media/resumable（512KB 分片、归属校验、会话绑定 userId/albumId、24h TTL），失败自动回退整图。
- 启动维护接入 OfflineBootstrap；SyncCenter 展示本地媒体占用/配额/缩略图数。

## B11 + B10
- lib/auth.ts 写路径全部显式 username/id；删除 9 个零调用旧函数；忘记密码按邮箱精确定位用户；admin 页面守卫（能力接口）。
- /api/health：startedAt 顶层记录（uptime 不再 null）、migrations（未完成/回滚项）、storage（upload+delete 探针），三者全绿才 200。

## B8 + P3-40
- npm audit：43（24 high）→ **29（13 high / 11 moderate / 5 low / 0 critical）**；nodemailer 10.1.7、prisma 7.10.1、mysql2 3.24.6、postcss 8.5.31、tmp 0.2.7、basic-ftp 6.2.3。
- 剩余 13 high 全在 dev/build 链路（braces / extract-zip 上游无补丁、tailwind 4、next 16），DEPS.md 记录根因与 2027-01-31 复评；dependabot 分组/ignore 更新。
- 文档治理：改动记录拆分 scripts/split-changelog.cjs（113 节 → docs/design/changelog/2026.md，幂等 + --check 门禁）、ADR 模板、发布说明模板、失效注释盘点。

## P3-38/39
- 契约测试：7 个 schema 文件全部导出 schema 的合法/缺字段/类型错/边界 + 统一错误形状 + parseBody/withAuth 契约（59 例）；docs/api/contract.md 覆盖 85 个路由文件 / 108 个写 handler。
- 覆盖率：Statements 52.38% → **58.11%**；Branches 45.43% → 49.32%；Functions 50.66% → 57.64%；Lines 54.45% → 60.45%；阈值 51/45/50/53 → **57/49/57/59**。

## B2 + B1 + B12
- 对比度：59 处 text-travel-ink/70 → /80（4.12:1 → 5.37:1，达 AA）；剩余 /60、/50 档位登记 deferred。
- 弹层：24/24 个 role=dialog/alertdialog 全部接入 useModalLayer（焦点圈定/恢复、ESC/返回键、滚动锁）。
- a11y E2E：登录态页面 7→12，新增「已登记待收敛对比度」机制与命令面板焦点回归。
- 裸 img：23 个标签补 16 处属性，22/23 四属性齐全（object-contain 大图预览有意不猜比例）。
- OG：public/brand/og-1200x630.png（1200×630，79.6KB），layout 与 circle/travel 详情页回退品牌 OG。

## B3
- 658 处 legacy 变量（--album-*/--social-*/--space-*）→ --ui-*（32 文件，源码残留 0）。
- tailwind 四色板改 rgb(var(--ui-tw-*-rgb)/<alpha-value>)，52 组通道；迁移前后 1641 条 class 探针比对 1483 条颜色声明 0 不等。
- checker 第 12 条清零（400 → 0），基线收紧到 307/398；parity 345/345 PASS。代价：tokens.css +6.2KB raw / +1.36KB gzip。

## D2 缓存清理（代码侧）
- `lib/media-url.ts` 新增 MEDIA_URL_VERSION=2：/api/images 序列化统一加 ?v=2，旧 1 年 immutable 缓存条目自然失效（无需 CDN 控制台）。
- 生产 Nginx 核查：无 /api/images 的 proxy_cache；/uploads 直出无 immutable。

## 本轮验证（实跑）
- tsc 0；vitest **103 文件 / 938 用例**全绿；coverage 58.11/49.32/57.64/60.45（阈值 57/49/57/59）。
- lint 454 warning / 0 error（预算 486）；tokens:check 307/398 exit 0；parity PASS。
- audit-gate exit 0（13 high 全豁免）；verify-version 1.25.0/56 通过；split-changelog --check 通过。
- Web build exit 0；移动静态导出 exit 0；`gradlew assembleRelease` BUILD SUCCESSFUL。
- APK：**14,727,474 B**，versionCode 56 / versionName 1.25.0，label 甜途，签名 MD5 f67e57f3… 与历史一致；manifest cleartext=false / allowBackup=false / networkSecurityConfig / dataExtractionRules。

## 仍待外部环境/产品决策
1. 生产部署与迁移/备份/缓存的实际验证（本轮随后执行，见部署记录）。
2. a11y E2E 实际运行（本机无 MySQL）；/60、/50 透明度档位待收敛。
3. 非 portal 弹层的 inert 只能冻结 body 级兄弟节点，彻底方案需统一 portal（布局重构）。
4. next 16 / prisma 8 / tailwind 4 / eslint 10 大版本升级（DEPS.md 有计划）。
5. APK 信创/真机验证：SQLite 加密迁移、压缩画质、隐私锁、分片续传。
6. 多副本部署假设（临时目录、内存限流/缓存）仍为单实例。


---

# 附五：A1 CI 首跑 / A3+A4+D2 生产部署验证（2026-10-19）

## A1 CI 首跑：真实拦住 4 个问题后全绿

首跑依次暴露并修复：
1. **Type check 红**：CI 的 `npm ci` 不执行被 allow-scripts 拦截的 postinstall，Prisma Client 未生成；把 `npx prisma generate` 前移到 lint/typecheck 之前（commit 756b735）。
2. **Design tokens 红**：C1 新增的 PrivacyLockGate/SyncCenter 引入 4 处新违规；修掉 lucide 直引/字号，B3 收敛 legacy 后基线收紧到 307/398。
3. **E2E 红（1）**：home-aggregate 仍按 P1-18 之前的「客户端请求 /api/home」契约断言；改为 SSR 直出 + 聚合接口契约 + 可见 h1=1（commit a6a9e05）。
4. **E2E flaky（1）**：auth 用例点抽屉入口未等待水合完成；改为先等待 visible 30s 再点（commit eae833b）。
最终：**c6a82ba 的 CI 两个 job（ci + e2e-smoke）全绿**（c6a82ba 之前的 eae833b/f29f134 也绿）。

## A3 生产部署（1.24.8/54 → 1.25.0/56）

- 部署包：`git archive HEAD`（31.5MB）→ scp → `scripts/server-rebuild.sh`（磁盘清理/空间校验/备份门禁/清理归档中已删源码/解包/重建/健康检查）。
- 构建期真实问题（已修）：
  a) 服务器上残留旧测试 `tests/security/video-path-traversal.test.ts`（引用已删除的 app/api/video 路由）被 COPY 进 Docker 构建上下文，导致镜像 typecheck 失败 → server-rebuild 的 stale 清理目录加入 `tests`。
  b) `docker-compose.yml` 重复 `APP_CHANGELOG` 键导致 YAML 解析失败 → 去重。
  c) 健康检查 `migrations` 把「已回滚 + 重新 resolve 成功」的同名历史行误判为 pending → 改为「无任何成功应用的迁移才算 pending」。
- **迁移事故与恢复（数据无损）**：存量库是 db push 长出来的，P1 迁移在 `CREATE INDEX Album_travelId_idx` 处 P3018/1061（该索引 db push 已建过）。按 DEPLOYMENT.md 新增的《存量 db-push 库升级已知坑》流程：`migrate diff --from-config-datasource` 生成缺失 SQL（2 张同步表 + 4 个 updatedAt 索引）→ mysql 应用 → `migrate resolve --applied` P1 与 sync 迁移 → 清理失败历史行。最终 `prisma migrate status` = up to date，live schema 与 schema.prisma **diff 0**。
- 验证（生产实跑）：
  - `/api/health` 200：db ok / migrations ok / storage ok / uptime 正常。
  - `/api/version` = 1.25.0 / build 56，含 **sha256=48c66eae…、size=14727474、minSupportedBuild=54**（compose env 透传修复后生效）。
  - 入口日志：`No pending migrations to apply` → Next.js 15.5.27 Ready。
  - 公网 HTTPS：/api/health 200、/api/version 200、/login 200、/ 307（未登录跳登录，符合预期）。
  - 镜像内置测试：typecheck + lint(454/486) + vitest 938 全绿。

## A4 备份 / 恢复演练 / 定时任务

- 新备份：`backups/db/travel_notes-20261019-204253.sql.gz`（42KB，gzip -t 通过）。
- `backup-db.sh --check` 通过；`--verify` 恢复演练到临时库 `travel_notes_verify_20261019`：**User 行数 = 30**，与源库一致；演练后删除临时库。
- cron 已安装：`30 2 * * * cd /home/ubuntu/travel-notes && ./scripts/backup-db.sh >> logs/backup.log 2>&1`（与服务器既有的磁盘清理任务并存）。

## D2 缓存清理

- 代码：`lib/media-url.ts` 对 `/api/images/<id>` 统一加 `?v=2`（MEDIA_URL_VERSION），旧 1 年 immutable 缓存条目自然失效；新响应已改为 public 86400 / 私有 no-store。
- 生产核查：Nginx 无 /api/images 的 proxy_cache；/uploads 为 alias 直出（无 immutable）；当前库 **PostImage=0 / Media=19**，实际受旧缓存影响的资源极少，代码修复为后续兜底。

## APK 发布

- 发布 `/var/www/travel-notes-downloads/tiantu.apk`：**14,727,474 B**，sha256 `48c66eae7e7480d95397452ead6b2dd19a885a214cf18bb27f32223405604e8d`（与本地 APK 一致）；带版本副本 `tiantu-20261019-v1.25.0-b56.apk`。
- 公网下载验证：HTTP 200、size=14727474、sha256 一致。

## 仍未完成（明确列入下一批）

1. **存量库自动迁移修复**：bootstrap 目前遇到「P1 索引已存在」会失败退出（已提供手工恢复文档）；要做成自动判定需要更多真实库样本验证。
2. 生产环境 a11y E2E/axe 未跑（CI 无浏览器依赖 axe 的失败项已用登记机制兜底）。
3. 真机验证（SQLite 加密迁移、压缩画质、隐私锁、分片续传）与 APK 安装升级路径。
4. 多副本部署（临时文件/内存缓存仍是单实例假设）。
5. next 16 / prisma 8 / tailwind 4 / eslint 10 大版本（DEPS.md 有计划）。


---

# 附六：下一批六项收口（2026-10-19 · 1.26.0 / build 57）

## ① 存量 db-push 库迁移自动修复 ✅
- scripts/migrate-bootstrap.cjs 重写：存量库 resolve 基线后探测 P1 七个对象 → 缺失部分用 migrate diff 计算、**只应用加法 DDL**（DROP/RENAME/MODIFY/数据语句即中止）、复核 schema diff 为空、逐个 resolve 未记录迁移、再交 entrypoint deploy；失败 exit 1 + 6 步手工指引。
- 测试：16 例纯函数单测 + 4 例真实 MySQL 集成（模拟 P3018 现场/真正 partial/幂等/全新库），集成断言 schema diff 0。
- 文档：DEPLOYMENT.md 迁移章节改为「四分支 + 自动修复 + 手工兜底」。

## ② 多副本准备 ✅
- 可选 Redis：缓存（tag 失效/PX TTL/失败降级内存）、限流（固定窗口/失败锁/指数退避/降级）、懒连接 500ms 超时+60s 冷却；未配 REDIS_URL 行为与改造前完全一致。
- 媒体分片临时目录 MEDIA_TMP_DIR；compose 可选 redis profile；docs/ops/多副本部署.md 列出 14 项进程内单例清单、scale 示例与迁移顺序。
- 遗留：34 处 app/api 限流调用点仍内存版（文档有迁移清单，可分批）；视频分片路由仍 os.tmpdir；feed 缓存 60s 不一致；调度去重/日志聚合属外部配置。

## ③ 真机/模拟器验证 ⛔ 环境阻塞（静态验证全部通过）
- 无 Hypervisor 且无真机：emulator -accel-check 明确报缺驱动；-accel off 软件模拟 15 分钟未 boot（进程 0 CPU）。
- 静态替代全部通过：1.25.0/56 包 versionCode/ABI/加固属性/签名与旧包一致（可覆盖升级）；包内命中 B4/B5/C1 特征（/api/media/resumable、__clientMutationId、db-upgrade-backup.json、SecureStore、libsqlcipher.so）；debug 包已构建，真机可直接 run-as 验库头。
- 待真机清单（报告 §6）：SQLite 明文→加密迁移、覆盖升级数据保留、隐私锁冷启动、R8 运行时、压缩/分片、WebView 首屏、logcat 无 FATAL。

## ④ 大版本升级（隔离 worktree → 合并主干）
- **Next 16.4.2 / React 19.3.1 / ESLint 10.13 ✅**：middleware→proxy、去 tsconfig BOM、flat config、lint 预算 460 单一来源；Turbopack 构建 84/84。
- **Tailwind 4.3.3 ❌ 回滚**：v4 的 @apply 不支持变体（5 个 @apply 块/3 个带变体）、typography 插件需 @plugin、无视觉基线；已 reset 回 3.4.19，迁移方案写入 UPGRADE-EVALUATION.md。
- **Prisma 8 ⏸ 不升级**：仍为 8.0.0-rc.23，@prisma/client 无 8.x 配套（E404）；engines 不再支持 Node 20，且自定义 adapter/migrate 链耦合深。
- 合并后 gate：tsc 0、vitest 107 文件/978 通过（4 skip）、lint 0 error/452 warning（预算 460）、tokens/parity PASS、Turbopack build 84/84、audit-gate 0。

## ⑤ a11y axe 真实运行 ✅ 18/18
- 真实 MySQL 8.4（3307）+ Next server（3111）+ Playwright 1.63/axe 4.13；15 页（匿名 3 + 登录 12）+ label/图标可读名 + 命令面板焦点圈定。
- 首跑 9 failed → 逐项修复：Footer ink/60（命中 8 页）、download/travel/login/admin-login 对比度与 24×24 触控目标、LoginDoor/LargeTitle 的 inert、城市邮戳滚动容器 tabIndex、social-accent→accent-strong、8 个纯图标控件补名、social-faint→muted 26 处。末跑 18/18，KNOWN_CONTRAST_DEFERRED 为空。

## ⑥ 部署脚本端到端 + 1.26.0 发版
- 本轮以 1.26.0 真实走完 server-rebuild（磁盘/空间/备份门禁/清理/解包/重建/健康检查）与镜像构建；部署后验证见下方「发布记录」。
- APK：15,306,490 B，versionCode 57 / 1.26.0，签名 MD5 f67e57f3…（与历史一致）。


## 1.26.0 发布与 CI 收口记录（2026-10-19 23:20）

- 镜像构建：8fcb5e2895bb（Next 16.4.2 / Turbopack），容器 healthy；/api/health 200（db/migrations/storage 全 ok），/api/version = 1.26.0/build 57 且 sha256/size/minSupportedBuild 正确。
- APK 已发布：tiantu.apk = 15,306,490 B，sha256 46a6bf93…，公网下载 200 且哈希一致。
- 部署踩坑（已修）：服务器残留旧根文件 middleware.ts，Next16 构建报「Both middleware and proxy detected」→ server-rebuild 新增根目录源码按归档同步（middleware.ts/proxy.ts/next.config.js/eslint.config.mjs 等）；同时 tests/ 已纳入 stale 清理。
- CI e2e 首跑失败根因（已修）：新库 e2e 账号首次登录会弹「偏好问卷」全屏 dialog（B2 接入 useModalLayer 后具备点击拦截），挡住 mobile-drawer 用例；global-setup 现通过 PATCH /api/me/preferences {skipped:true} 落库 + storageState 预置 onboard localStorage，用例从「老用户」状态开始。CI 同款环境本地复跑 17/17 通过。

## 六项最终状态

| 项 | 状态 | 证据 |
|---|---|---|
| 存量库迁移自动修复 | ✅ | 16 单测 + 4 真实 MySQL 集成；DEPLOYMENT.md 自动修复章节 |
| 多副本准备 | ✅ | Redis 缓存/限流/降级、MEDIA_TMP_DIR、compose profile、14 项单例清单；tsc/vitest 978 |
| 真机验证 | ⛔ 环境阻塞 | 无 hypervisor/真机；静态 APK 证据 + debug 包已构建；报告 §6 待真机清单 |
| a11y axe | ✅ 18/18 | 真实 MySQL+Playwright；0 未登记 critical/serious |
| Next16/ESLint10 | ✅ 已合并 | Turbopack 84/84、flat config、lint 460 预算；proxy.ts 迁移 |
| Tailwind 4 | ❌ 回滚 | @apply 变体/typography 插件/无视觉基线；评估文档 |
| Prisma 8 | ⏸ 阻塞 | 仅 RC、无 8.x client；engines 与 adapter 耦合 |
| 部署脚本端到端 | ✅ | 1.26.0 真实 deploy；根文件同步修复已验证 |
