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
