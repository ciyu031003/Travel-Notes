## [1.16.0] - 2026-09-25

### Added
- **「我的空间」模块（新）**：`/space` 空间列表 + `/space/[slug]` 空间详情页，取代原 `SpacePanel` 弹窗。
  - 空间详情含五段：一起记录的旅行 / 一起经营的相册 / 正在规划 / 最近的共同回忆 / 空间动态，外加成员与邀请。
  - 创建空间时可选类型（情侣 / 家庭 / 朋友 / 独旅 / 其他），**每类一套清新淡雅配色**（色源 Radix Colors，明暗双主题，WCAG AA 已逐项校核）。
  - 成员管理升级：角色调整（主人/成员/访客，保留最后一位主人）、邀请码可选角色与有效期、邀请记录三态（待使用/已使用/已过期）、移除与退出。
  - 空间动态复用既有 `AuditLog`（零改库），内容归属显示「谁创建的 / 最近谁改的」。
- 新增 `GET /api/spaces/[id]/overview`（一次取回空间详情页全部数据）、`PATCH /api/spaces/[id]`（改名/改简介/改类型/换封面）、`PATCH /api/spaces/[id]/members`（角色调整）。
- 组件预览台新增 `/dev/ui/space`（五套主题并列评审，生产构建 404）。
- 维护脚本：`scripts/backfill-space-member-userid.cjs`（回填成员 userId）、`scripts/gc-orphan-spaces.cjs`（孤儿空间治理，默认 dry-run）、`scripts/space-preview-shots.mjs`（预览台截图）。

### Fixed
- **空间协作被一列数据挡死**：`SpaceMember.userId` 在「加入空间」与「创建空间」两条路径里都从不写入，而权限判定有 username 与 userId 两套键 ——
  用邀请码加入的成员**看不到也改不了**空间内任何内容；`getUserCapabilities` 又把「查不到成员身份」当成单用户 `OWNER`，**成员越权**拿到主人能力。现已写入侧补齐 + 双键查询，并附回填脚本。
- **相册读路径漏了空间范围**：`listAlbums`/`getAlbum` 只认 userId，而 `canManageAlbum` 已允许空间成员编辑 —— 成员看不到彼此的相册却能改。现与 `listTravels` 统一走 `lib/modules/access/space-scope`。
- **中文名空间创建 100% 失败**：服务端 slug 只接受 ASCII，而前端生成的是中文 slug。现由服务端派生（中文名回退 `sp-xxxxxxxx`），前端不再填 slug。
- 后台空间管理创建时不传 `spaceType`，导致后台建的空间类型恒为「其他空间」；现已补类型选择并显示类型徽标。
- 空间加入/角色/统计的文案拼接重复（「调整了权限成员」「邀请了新成员邀请」）。
- `tests/e2e/me-archive.spec.ts`：统计断言会被 `CountUp` 动画中间帧误伤（整套跑首次必挂、重试必过），改为读取稳定值。

### Changed
- 《移动端设计规范》新增 **§2.8 受控多主题（仅空间模块）**；`scripts/check-design-tokens.mjs` 新增第 11 条 `spaceTokenLeak`（`--space-*` 只允许出现在空间模块范围内，实测 0 泄漏）。
- `/me` 的「我的空间」入口改为跳转 `/space`；旧 `components/space/SpacePanel.tsx` 删除。

---

## [1.0.0] - 2026-09-01

### 版本重置 · 全新起点
- 删除全部历史版本标签（v1.0.0~v3.0.1），从 1.0.0 重新开始版本号（versionCode=1）。
- 移动端（甜途 App）正式上线：媒体绝对 URL 修复、Cookie Secure、OTA 版本机制、游客可浏览公开内容。
- 包含阶段 A 性能优化（API 缓存头、统一取数层、查询优化、媒体直出、限流）。

---

# Changelog

本项目所有值得注意的变更均记录于此。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [3.0.1] - 2026-08-30

### Fixed
- 相册正确性止血（全面体检 Phase A）：
  - TravelBook 加载失败无限转圈（补 res.ok/失败态 UI/重试/AbortController）
  - 城市画册 React key 重复（travelId 恒 0 → 新增稳定 bookKey）
  - 删相册/移除媒体打碎其他相册或回忆引用（新增 AlbumMedia/MemoryMedia 引用检查）
  - 素描本 Escape 恒穿透（分层退出：查看器 > 目录 > 整本）
  - 素描本触屏拖拽翻页不跟手（touch 手势支持 + pointercancel 回弹 + 纵向滚动意图识别）
  - /album viewMode hydration mismatch（改挂载后读 localStorage）
  - 城市画册章节倒序（改日期升序，DAY 01=第一天）+ 跨源画册去重（Travel 优先）
  - 城市串册（findCityByName 收紧为精确/行政后缀/结尾/长查询四级）

### Security
- 油画链路 SSRF 根治（同源强校验，杜绝反斜杠/编码绕过）+ 同图计费去重 + 每用户限流
- /api/uploads 扩展名白名单（拒 .sql/.db/.svg 等）+ 单段 Range/206 实现
- 中间件：/api/admin/settings 移出公开白名单（子路由均自带鉴权）+ 段边界匹配
- 验证码日志脱敏（生产不落明文）；secret-crypto 解密失败留痕
- 删除含明文密码的 setup.sql

### Added
- 后台「油画生成」设置 Tab：总开关（DB 优先/环境变量回退）+ DashScope API key 在线管理（AES-256-GCM 加密落库，只回打码掩码）

### Removed
- 死代码清理：PhotoRiver/ParticleImageBg/GalaxyBackground/AlbumLightbox 组件、TravelBook 内 215 行死 Reader、/albums/[id] 死路由、复数 /api/albums 与 /api/video 路由（测试重定向到现役路由）
- 孤儿依赖 markmap-common/lib/view；@types/* 与 @capacitor/cli 移至 devDependencies
- v1.x 裸机部署时代文件（migrate-db.cjs/deploy.sh/ecosystem.config.js）

## [3.0.0] - 2026-08-25

### Added
- 产品定位升级「行迹 · 个人旅行记忆空间」（去情侣化）
- Capacitor Android 移动端（离线 SQLite、同步中心、APK 构建链）
- 多元旅行场景：Travel.travelType + companions（独旅/情侣/家庭/朋友/闺蜜/结伴）+ Space.spaceType + 相册类型分组/同行者筛选 + 档案「和 TA 们去过」聚合
- 旅行画册 2.0（Post 城市聚合出册）+ 内容管理 2.0（文章可见性 × 旅行圈分享解耦）
- UI V2/V3：品牌色暖陶土统一、语义 token、ui/ 组件库补全、暗色归一、移动端地图触摸手势

### Fixed
- Prisma Json 序列化严重 bug（jsonStrings:true）修复 companions 写读全崩
- MySQL 枚举迁移三步走（COUPLE→SPACE）修复部署顺序 bug

## [2.5.0] - 2026-08-16

### Added
- Travel 移动端记录（Phase 3 补充）：
  - 新增 /travel/[slug]/record 记录页（标题/内容/心情）
  - 新增 /api/travels/[id]/memories 与 /api/travels/by-slug/[slug]
- UI/性能（Phase 6）：全站图片迁移到 next/image（旅行/相册/地图/首页/上传等），视频播放器动态导入
- Media 2.0（Phase 4）：
  - 上传生成 Thumbnail/Preview/Blur 媒体变体并写入 MediaVariant
  - 新增 scripts/migrate-media.cjs（PostImage LongBlob → 本地文件 + Media 记录）
- Timeline 统一（Phase 5）：
  - timeline.service 优先读取 TimelineItem，回退 Travel/Memory
- UI/UX+性能（Phase 6）：
  - 旅行详情页 VideoPlayer 改为动态导入
- 工程化收尾（Phase 7）：
  - 新增 docs/BACKUP_AND_MONITORING.md（定时备份/恢复演练/监控/错误追踪）
- Travel 2.0 前台（Phase 3，进行中）：
  - Travel 模型增加 content/tags/location/cover 文章兼容字段
  - /travel 列表页优先读取新 Travel 模型（未迁移时回退旧 Post）
  - 新增 scripts/migrate-travels.cjs（Post(type=travel) → Travel）
- 安全与隐私补漏（Phase 1）：
  - 相册 API 服务端访问控制（album_token），前台解锁弹窗
  - 邮箱验证码落库（VerificationCode，只存哈希）+ nodemailer SMTP 发送
  - middleware CSRF Origin 校验 + 存储键 crypto.randomUUID
- 数据模型收敛（Phase 2）：
  - 新增 User 表（多账号基础），认证从 SiteSetting 平滑迁移到 User
  - 新增 TimelineItem 统一时间线表
  - Session / SpaceMember / Memory / AuditLog 增加 userId 外键
  - 新增 scripts/migrate-phase2.cjs 数据回填脚本
- 工程化基线（Phase 0）：
  - Vitest 测试框架 + 单元/安全回归测试（媒体校验、限流、Markdown XSS、认证、视频路径穿越、权限 IDOR、上传鉴权）
  - GitHub Actions CI（lint → typecheck → test → build）
  - CHANGELOG 与分支规范（develop / feature / fix / security / refactor）
- 修订版优化整改路线图（docs/Travel-Notes-2.0-优化整改路线图-修订版.md）

## [2.1.0] - 2026-08-10

### Added
- 相册粒子银河空间模式与粒子化照片留言
- 留言页 Three.js 粒子化背景

## [2.0.0] - 2026-08-10

### Changed
- 产品重构为情侣共同旅行与记忆系统
- P0 安全加固：Session 落库、上传/Markdown 安全、限流、安全头
- P1 架构收敛与数据模型：Space/Travel/Memory/Media/Album/AuditLog

## [1.x] - 更早版本

### Added
- 旅行记录、中国地图、弹幕、碎碎念、点赞、静态全文搜索、相册灯箱、移动端适配等早期功能（详见 git tag v1.0.0 - v1.1.0）
