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
