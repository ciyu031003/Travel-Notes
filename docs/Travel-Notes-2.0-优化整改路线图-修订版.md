# Travel-Notes 2.0 优化整改路线图（修订版）

> 版本：v2（2026-08-16）· 基于仓库代码现状 v2.1.0 逐项重新核对
> 原文档：《Travel-Notes-2.0-优化整改路线图.md》（E:\Codex_output_files）
> 图例：✅ 已完成 · ⚠️ 部分完成 · ❌ 未完成 · 🆕 新增（本修订版补充）· ⏸ 暂缓（有意推迟）

---

## 0. 修订说明

原路线图写于项目完成 P0/P1/P2 之前，部分章节已落后于代码现状。本修订版以 2026-08-16 的仓库快照为准，逐条核对状态，并补充原文档未覆盖的真实缺口。

### 已确认的实施决策（2026-08-16）

| # | 决策 | 说明 |
|---|---|---|
| 1 | 实施顺序按 Phase 0→7 执行 | 工程化基线 → 安全补漏 → 数据模型 → Travel 前台 → Media → Timeline → UI/性能 → 工程化收尾 |
| 2 | 引入 User 表并迁移 SiteSetting 单管理员 | 为情侣双账号铺路；SpaceMember/Memory/AuditLog 改用 userId 外键 |
| 3 | SMTP 邮件代码先写好 | 真实发送代码 + 环境变量配置说明，由用户手动配置 SMTP |
| 4 | 本修订版存放于 docs/ | 不写入 E:\Codex_output_files |

### 现状速览（v2.1.0）

- 技术栈：Next.js 15.5（App Router）+ MySQL + Prisma 7 + TypeScript + Tailwind
- 已完成：Database-backed Session、Space/RBAC、AuditLog、上传安全、Markdown XSS 防护、Security Headers、限流、对象存储抽象、缓存、Travel/TravelDay/Location/Memory/Media/Album 等新数据模型与后台管理
- 主要缺口：前台旅行体验仍走旧 Post 模型、无测试/CI/CHANGELOG、相册访问控制服务端缺失、验证码未落库/邮件未接入、无 User 表、TimelineItem 表缺失、next/image 与动态导入零使用

---

## 1. 文档目标

原意：渐进式整改（安全 → 架构 → 数据模型 → 旅行 → 媒体 → 时间线 → UI/UX → 性能 → 工程化），不推倒重写。

**修订结论：方向正确，保留。** 实际执行以本修订版 Phase 0→7 为准。

## 2. 产品定位调整

原意：从"个人博客"定位为"情侣共同旅行与记忆系统"。

**✅ 已完成**：package.json description 已为"情侣共同旅行与记忆系统"，前台/后台/数据模型均已按此演进。

## 3. 项目现状判断

原文档认为仓库仍是"功能丰富的个人旅行博客"。**已过时**：仓库已是 v2.1.0，P0/P1/P2 大部分落地（见 §0 现状速览）。

## 4. 总体优先级

| 优先级 | 阶段 | 状态 | 备注 |
|---|---|---|---|
| P0 | 安全与稳定性 | ⚠️ 大部分完成 | 见 Phase 1 补漏项 |
| P1 | 架构治理 | ✅ 已完成 | modules/repositories/services/validators |
| P1 | 数据模型升级 | ⚠️ 大部分完成 | 缺 User/TimelineItem |
| P2 | Travel 2.0 | ❌ 前台未完成 | 有模型与后台，前台仍走 Post |
| P2 | Media 2.0 | ⚠️ 部分完成 | 缺变体/迁移/访问控制 |
| P2 | Timeline | ❌ 未完成 | 无 TimelineItem 表 |
| P3 | UI/UX | ⚠️ 部分完成 | tokens 已有，图片/动效优化未落地 |
| P3 | 性能 | ❌ 未完成 | 无 next/image、无动态导入 |
| P4 | 工程化 | ❌ 完全空白 | 无测试/CI/CHANGELOG/监控 |
| P5 | 产品增强 | ⏸ 暂缓 | 按计划放最后 |

---

## 5. 阶段 0：建立基线

| 任务 | 状态 |
|---|---|
| 5.1 Git 分支（main/develop/feature/*/fix/*/security/*/refactor/*） | ❌ 未完成 → Phase 0 |
| 5.2 CHANGELOG | ❌ 未完成 → Phase 0 |
| 5.3 技术债清单（docs/roadmap/*） | ❌ 未完成 → Phase 0（本修订版即清单之一） |
| 5.4 测试基线（认证/权限/旅行 CRUD/Space/媒体/Markdown/密码找回） | ❌ 未完成 → Phase 0 |

## 6. 第一阶段 P0：安全整改

| 子项 | 状态 | 现状/补充 |
|---|---|---|
| 6.1 统一认证链路（requireAuth/requireSpaceMember/requireSpaceRole/requireResourceAccess） | ✅ 已完成 | lib/auth-middleware.ts + lib/modules/space/permissions.ts；所有 /api/admin/* 均过 requireAuth |
| 6.2 IDOR 审查 | ⚠️ 基本完成 | Space/Travel/Memory API 已过权限校验；🆕 相册/媒体 API 服务端访问控制缺失（Phase 1） |
| 6.3 上传安全 | ✅ 已完成 | Magic Number + sharp 重编码剥离 EXIF + 10MB/8000px/20 张 |
| 6.4 视频安全 | ✅ 已完成 | basename + startsWith 双校验、Range 支持、MP4/WebM/OGG |
| 6.5 Markdown / Mermaid 安全 | ✅ 已完成 | rehype-raw + rehype-sanitize 白名单 + Mermaid strict；🆕 缺 XSS 回归测试（Phase 0） |
| 6.6 密码找回 | ⚠️ 部分完成 | 6 位验证码 + 限流已有；🆕 验证码存内存 Map、邮件未真实接入（Phase 1 落库 + SMTP） |
| 6.7 Cookie / Session | ✅ 已完成 | Session 落库、可撤销/过期、改密/重置撤销其它会话 |
| 6.8 Security Headers | ✅ 已完成 | CSP/HSTS/nosniff/Referrer-Policy/Permissions-Policy/Frame |

## 7-9. 第二阶段 P1：架构治理

| 子项 | 状态 | 备注 |
|---|---|---|
| 7.1 不再扩张万能 PostService | ✅ 已完成 | 新功能均进入新领域模型 |
| 8 新模块结构（modules/infrastructure/shared） | ✅ 已完成 | lib/modules/{space,travel,memory,album,timeline,audit,anniversary} + infrastructure + repositories + validators + container |
| 9 模块内部统一结构 | ⚠️ 部分完成 | 部分模块缺独立 repository/validator；🆕 Phase 2 统一术语并收敛 |

## 10-12. 第三阶段 P1：数据库模型升级

| 原文档模型 | 代码现状 | 状态 |
|---|---|---|
| User / Workspace | SiteSetting 单管理员，无 User 表 | ❌ 未完成 → Phase 2 |
| WorkspaceMember | SpaceMember（username 字符串外键） | ⚠️ 待改 userId → Phase 2 |
| Trip / TripDay / TripPlace / TripActivity / TripExpense | Travel / TravelDay / Location / ItineraryItem / Expense | ✅ 已完成（命名不同，等价） |
| Memory | Memory | ✅ 已完成 |
| Media / Album / AlbumItem | Media / MediaVariant / Album / AlbumMedia | ✅ 已完成（变体未生成） |
| Article / Tag / Category | Post（legacy） | ⏸ 保留旧体系，新功能不扩张 |
| TimelineItem | 无表，timeline 服务现场聚合 travel+memory | ❌ 未完成 → Phase 2 |
| AuditLog / Session | AuditLog / Session | ✅ 已完成 |

**🆕 术语统一**：文档 Trip=代码 Travel、TripPlace=Location、TripActivity=ItineraryItem，后续文档与代码统一用后者。

## 13-14. Media 2.0

| 子项 | 状态 | 备注 |
|---|---|---|
| Media 独立模型 | ✅ 已完成 | 含 visibility/coordinates/hash |
| MediaVariant | ⚠️ 表已建，未生成 | → Phase 4 生成 Thumbnail/Preview/Blur |
| 对象存储抽象 | ✅ 已完成 | S3 兼容（MinIO/R2/OSS），未配置回退本地 |
| 图片迁移（LongBlob→对象存储） | ❌ 未完成 | → Phase 4 五步走 |
| 图片 EXIF / GPS | ⚠️ 展示侧有 exif.ts；上传侧剥离 | → Phase 4 收口 |
| 🆕 媒体访问控制 | ❌ 未完成 | /uploads 与 /api/images 公开；→ Phase 1 相册 API 加锁、Phase 4 媒体中心收口 |
| 🆕 存储键随机性 | ❌ 未完成 | Math.random() → crypto.randomUUID()（Phase 1） |

## 15-16. Space 2.0 / 权限模型

| 子项 | 状态 | 备注 |
|---|---|---|
| Space 模型 | ✅ 已完成 | Space/SpaceMember/SpaceInvite |
| 角色 | ✅ OWNER/MEMBER/VIEWER | 🆕 结论：不新增 ADMIN/EDITOR（单管理员场景属过度设计） |
| 权限方法 | ✅ 已完成 | requireSpaceMember/Role/Owner + canRead*/canEdit* |
| 🆕 多用户支持 | ❌ 未完成 | 依赖 User 表（Phase 2） |

## 17-20. 第四阶段 P2：Travel 2.0

| 子项 | 状态 | 备注 |
|---|---|---|
| 数据模型（Trip/Day/Place/Activity/Expense） | ✅ 已完成 | Travel 系列表 + 后台管理 |
| Trip 前台详情页（Header/行程/地图/地点/相册/回忆/总结） | ❌ 未完成 | → Phase 3 |
| Trip 列表 / 首页 / 足迹地图 | ❌ 未完成 | 仍读 Post(type=travel) → Phase 3 |
| 移动端旅行记录流程 | ❌ 未完成 | → Phase 3 |

## 21-23. Timeline / Memory / Album

| 子项 | 状态 | 备注 |
|---|---|---|
| Timeline 统一（TRIP/MEMORY/DIARY/MOMENT/PHOTO/ALBUM/ANNIVERSARY） | ❌ 未完成 | → Phase 2（表）+ Phase 5（前台） |
| Memory | ✅ 已完成 | 含 mood/location/travel 关联 |
| Album 2.0 | ✅ 已完成 | 后台 + 前台相册页；🆕 访问控制补漏见 Phase 1 |

## 24-27. 第六阶段 P3：UI/UX

| 子项 | 状态 | 备注 |
|---|---|---|
| Design System（Color/Typography/Spacing/Radius/Shadow/Motion/Icon） | ⚠️ 部分完成 | tailwind tokens 已有 travel 色系/字体/阴影/动效；→ Phase 6 收口 |
| Mobile First 底部导航 | ✅ 已完成 | 移动端底部 Tab 已有 |
| 🆕 图片/动效性能 | ❌ 未完成 | → Phase 6 |

## 28-31. 第七阶段 P3：性能

| 子项 | 状态 | 备注 |
|---|---|---|
| 动态导入（地图/Mermaid/Lightbox/视频） | ❌ 未完成 | next/dynamic 0 处 → Phase 6 |
| Next Image / WebP / AVIF / blur / CLS | ❌ 未完成 | next/image 0 处、裸 <img> 30 处 → Phase 6 |
| 缓存 | ⚠️ 内存缓存 + ISR 已有 | 暂不引入 Redis（与文档一致） |
| 搜索 | ✅ 静态索引 + 服务端回退 | 与文档一致，暂不引入全文检索集群 |

## 32-36. 第八阶段 P4：工程化

| 子项 | 状态 | 备注 |
|---|---|---|
| 测试结构（unit/integration/security/e2e） | ❌ 完全空白 | → Phase 0 |
| E2E 核心流程 | ❌ 未完成 | → Phase 0 搭框架，随 Phase 3 完善 |
| CI/CD | ❌ 未完成 | → Phase 0（GitHub Actions） |
| 数据备份 | ⚠️ 有脚本 | migrate-database.sh 已有；→ Phase 7 加定时与恢复演练 |
| 监控 / 错误追踪 | ❌ 未完成 | → Phase 7 |

## 37-40. 第九阶段 P5：产品增强

| 子项 | 状态 | 备注 |
|---|---|---|
| 情侣共同空间 | ⏸ 暂缓 | 依赖 User 表（Phase 2） |
| 年度回忆 | ⏸ 暂缓 | |
| 地图升级 / 足迹 | ⏸ 暂缓 | |
| AI 能力 | ⏸ 暂缓 | 放最后，与文档一致 |

## 41. 推荐最终信息架构

✅ 基本符合现状；最终架构细节随 Phase 3/5/6 前台重构落地。

## 42-51. 实施顺序（Phase 0-10）

原文档 42-51 的十个 Phase 与本修订版映射如下：

| 原 Phase | 本修订版 | 说明 |
|---|---|---|
| Phase 0 基线 | Phase 0 工程化基线 | 测试/CI/CHANGELOG/分支 |
| Phase 1 P0 Security | Phase 1 安全补漏 | 在原已完成基础上补服务端访问控制/验证码/SMTP/CSRF |
| Phase 2 P1 Architecture | ✅ 已并入现状 | 已完成 |
| Phase 3 P1 Database | Phase 2 数据模型收敛 | User/TimelineItem/外键 |
| Phase 4 P2 Travel | Phase 3 Travel 2.0 前台 | |
| Phase 5 P2 Media | Phase 4 Media 2.0 | |
| Phase 6 P2 Timeline | Phase 5 Timeline 统一 | |
| Phase 7 P3 UI | Phase 6 UI/UX+性能 | |
| Phase 8 P3 Performance | Phase 6 | |
| Phase 9 P4 Engineering | Phase 7 工程化收尾 | |
| Phase 10 P5 产品增强 | ⏸ 后续 | |

## 52. 不建议做的事情

| 原建议 | 结论 |
|---|---|
| 不要立即重写（Next/MySQL/Prisma） | ✅ 同意，维持 |
| 不要立即拆微服务 | ✅ 同意，Modular Monolith |
| 不要无限扩大 Post | ✅ 同意，新功能进新模型 |
| 不要过早引入 Redis/MQ/搜索集群 | ✅ 同意 |
| 🆕 不要新增 ADMIN/EDITOR 角色 | 单管理员场景过度设计 |
| 🆕 不要把新模型一次性全量切前台 | 先双写/迁移，验证后再切，避免数据事故 |

## 53-54. 最终技术架构 / 产品结构

✅ 目标一致。核心资产链 Space → Trip → Memory → Media → Timeline 已在数据层成型，前台待 Phase 3/5 补齐。

## 55-57. 执行原则 / 版本规划 / 最终建议

✅ 8 条执行原则全部保留。版本规划建议修订为：

| 版本 | 内容 |
|---|---|
| 2.1.x | 当前稳定版 |
| 2.2 | 工程化基线 + 安全补漏（Phase 0-1） |
| 2.3 | 数据模型收敛：User/TimelineItem（Phase 2） |
| 2.4 | Travel 2.0 前台 + Media 2.0 + Timeline（Phase 3-5） |
| 2.5 | UI/UX + 性能 + 工程化收尾（Phase 6-7） |
| 3.0 | 情侣共同空间（依赖 User 表，P5） |

---

## 附：新增缺口清单（原文档未覆盖）

| 编号 | 缺口 | 严重度 | 归属 Phase |
|---|---|---|---|
| G1 | 相册/媒体 API 服务端访问控制缺失（密码仅前端） | 🔴 P0 | Phase 1 |
| G2 | 验证码/重置码存内存、重启失效 | 🔴 P0 | Phase 1 |
| G3 | 邮件服务未接入，密码找回生产不可用 | 🔴 P0 | Phase 1 |
| G4 | 无任何测试基线，安全修复无法回归 | 🔴 P0 | Phase 0 |
| G5 | 无 User 表，多账号/情侣共同空间无基础 | 🟠 P1 | Phase 2 |
| G6 | 前台旅行仍走旧 Post，与新 Travel 模型脱节 | 🟠 P1 | Phase 3 |
| G7 | 媒体可见性（PRIVATE/COUPLE/PUBLIC）未真正生效 | 🟠 P1 | Phase 1/4 |
| G8 | 无 TimelineItem 表，时间线只聚合 travel+memory | 🟠 P1 | Phase 2/5 |
| G9 | next/image、next/dynamic 零使用 | 🟠 P1 | Phase 6 |
| G10 | 无 CI/CHANGELOG/监控/定时备份 | 🟡 P2 | Phase 0/7 |
| G11 | S3/存储键用 Math.random() | 🟡 P2 | Phase 1 |
| G12 | 无 CSRF（Origin）防护 | 🟡 P2 | Phase 1 |
| G13 | MediaVariant 表未使用、LongBlob 未迁移 | 🟡 P2 | Phase 4 |
