# 全维度评审 · 团队共享简报（Lead 撰写，2026-10-18）

## 项目事实（已由 Lead 核验）
- 仓库：F:\CodeFiles\Travel-Notes，分支 `master`，最新提交 `55f8c1b`（2026-10-17），版本 1.24.8 / build 54，487 次提交。
- Web：Next.js 15.5 App Router + React 19 + TypeScript 5.3（strict）。服务端分层 = 页面层(app/*) → 协议层(app/api/* + middleware.ts) → 业务模块(lib/modules/*) → 服务(lib/services) → 仓储(lib/repositories) → 基础设施(lib/infrastructure) → Prisma/MySQL（自定义 mysql2 适配器 lib/prisma-adapter.ts）+ DI 容器 lib/container.ts。
- 数据量级：app 190 文件/16.5k 行，components 199/32k，lib 158/17.5k，hooks 11/830，scripts 43/4.2k，tests 85/8.1k。prisma/schema.prisma 897 行。
- 移动端：Capacitor 8 Android（appId com.tiantu.app，名「甜途」），本地静态壳（MOBILE_EXPORT=1 → out/ → www/），API 走 NEXT_PUBLIC_API_BASE，本地 SQLite（@capacitor-community/sqlite）+ 写队列 + 同步引擎，APK 26.3MB。
- 部署：docker-compose（mysql 8.4 + app），Nginx 反代 HTTPS，COS/CDN 存媒体 + APK 分发。
- CI：.github/workflows/ci.yml（lint/typecheck/vitest/db push/build/tokens 基线门禁/npm audit 报告模式）。vitest 60 文件 554 用例、Playwright E2E 若干（仓库自述）。
- 文档：docs/design/改动记录.md（366KB 逐日变更）、CHANGELOG.md（92KB，含每版验证数据）、docs/DEPLOYMENT.md、docs/design/移动端设计规范.md、docs/design/UI优化方案-评审稿.md（团队此前自评）、docs/design/AppUI交付前检查清单.md。
- 截图：.review-shots/*.png（Web 页面与移动端 390 宽）、docs/design/screenshots/。
- 本地无运行中的服务（127.0.0.1:3000 未监听），没有 MySQL 实例可直接跑；不要花时间起整套服务（如需可谨慎尝试 `npm test` / `npm run typecheck`，但注意耗时）。
- `.env` 未被 git 跟踪（仅 .env.example），无 secrets 入库。

## 评审目标（用户诉求）
资深全栈架构师 + 安全工程师 + UI/UX 评审专家，对 Web 端 + 移动端做**全维度深度审查**，输出结构化中文报告，7 大模块：
1 系统架构 / 2 代码设计 / 3 API与数据 / 4 安全审计 / 5 性能 / 6 UI&UX / 7 工程化。
每问题必须写：问题描述、风险影响、改进方案；分级 🔴严重 / 🟡一般 / 🟢优化建议。方案要具体可落地（文件、代码级动作、验证方法），不要空话。

## 团队约定（必须遵守）
- **只读代码**，不改任何源码/配置/依赖。每人只在 `docs/review/_findings/<你的名字>.md` 写自己的发现文件；不要碰别人的文件，也不要写最终报告（Lead 汇总）。
- **证据强制**：每条问题必须给 `路径:行号` 或可复现命令/输出。禁止“可能存在”“建议考虑”式无证据猜测；推断性结论标注「推断」并说明依据。
- **分级严格**：🔴 = 可被利用的安全漏洞 / 会导致数据丢失或线上故障 / 明确的功能性破坏；🟡 = 真实缺陷或显著可维护性负债（有证据、有后果）；🟢 = 体验/性能/一致性提升项。宁缺毋滥，不要凑数。
- **先排除已修复项**：本项目改动记录很完整。报问题前先 `grep` CHANGELOG.md / docs/design/改动记录.md 确认不是已修（如已修但仍有残留，写“残留”）。已知存量问题（如 design token 439 处欠债）如仍存在，可报但要说明是存量。
- **同时记录优势**：每份发现末尾列 3–5 条“做得确实好的点 + 证据”，Lead 要写进总评。
- 若引用文档中的自述数据（如 554 用例），请自行核验（`Select-String` 统计、`git log` 等），核不动的标「仓库自述，未核验」。
- 时间预算：约 40–60 分钟。优先深挖本模块最高风险的 8–15 个点，而不是平均铺开 50 个浅点。发现文件控制在 120–200 行（Markdown，可含表格）。

## 发现文件模板
```md
# <模块名> 评审发现（<名字>）
## 结论速览
（3–5 句：本模块整体水平、最严重的 1–2 个问题）
## 问题清单
### [🔴/🟡/🟢] P-<序号> <一句话标题>
- **位置**：`path:line`（必要时多行号）
- **问题描述**：事实 + 代码证据（贴关键代码片段，≤10 行）
- **风险影响**：具体后果（谁、在什么场景、坏成什么样）
- **改进方案**：具体动作（改哪个文件、怎么改、验证方式）
## 优势（有证据）
## 未覆盖/待确认
```
