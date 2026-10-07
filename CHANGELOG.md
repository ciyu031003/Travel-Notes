## [1.19.0] - 2026-10-07

> 全维度代码评审后的第一批确定性修复（P0）。评审基线：typecheck 0 错误、vitest 全绿、
> 移动端/桌面/admin 三套 UI 的 token 与交互逐行核对。

### Fixed（确定性 bug · 9 项）

- **暗色用户冷加载闪白屏**：theme class 此前等 Navbar 水合后才从 localStorage 恢复，
  html 底色固定亮色——暗色用户每次冷加载先画亮色首帧。`app/layout.tsx` `<head>` 加
  阻塞式内联脚本先于首帧完成 `classList.add('dark')`（与 Navbar 同一 key）。
- **HomeClient FeatureCard className 拼接事故**：`shadow- lg:p-8[…]` 是两个无效类，
  lg 屏丢加宽 padding 与预期阴影 → 拆回合法写法。
- **8 处无效透明度修饰符**（样式静默失效）：Tailwind 3 默认刻度不含 /12 /16 /18 /72 /97，
  编译产物中不存在这些类。涉及 HomeMobile（地点 chip 半透明白底、卡片日期弱化）、
  TravelMobileClient、TravelPhotoViewer（左右翻页按钮底色）、ProvinceCityPanel、
  MobileProvinceDrawer，统一改为任意值写法 `/[0.x]`。
- **深链返回行为**：`router.back()` 在通知/分享深链进入时会把用户退出站点。
  新增 `lib/navigation.ts#goBackOrHome`（有应用内历史 → back，否则 fallback），
  统一接入 EdgeSwipeBack / UserProfile / TravelDetailShell / LargeTitle
  （LargeTitle 原实现无历史且无 back 参数时会卡住，一并修复）。
- **弹层不接管物理返回键**：Android 返回键/浏览器返回在弹层打开时直接离开页面。
  TravelPhotoViewer 已验证的 pushState+popstate 模式抽为 `useCloseOnBack` hook
  （补齐嵌套语义：栈序保证逐层关闭），接入 ui/Modal、BottomSheet（含 ActionSheet）、
  SideDrawer、CommentPanel。
- **碎碎念空态 CTA 甩访客去后台登录页**：首页空态「写一条碎碎念」href=/admin/moments
  → 改跳 /moments（页面内有写入口）。
- **Footer 占位死链**：移除 mailto:your@email.com / github.com 脚手架占位，
  「联系方式」改为「获取应用」→ /download。

### Changed

- **花费金额改整数分存储**（精度修复）：`Expense.amount Float(元)` → `amountCents Int(分)`。
  浮点元直接求和会累积 0.1+0.2 类二进制误差；整数分求和永不丢精度。
  - 迁移内嵌 `scripts/apply-schema-migration.cjs`（幂等、值保持）：加列 → 元×100 回填 →
    删旧列。**特意在启动路径、prisma db push 之前执行**——新 schema 已删 amount 字段，
    db push 会 DROP 该列，回填不先行则历史金额永久丢失。
  - 元↔分换算单一事实源 `lib/modules/travel/money.ts`；API/前端契约仍是「元」，
    Web 与移动端 App 均无需感知；合计在整数分上求和后转回元。
  - 新增 `tests/unit/money.test.ts`（往返无损 / 0.1 类收口 / Int 上限 / 浮点对照）。
- **CSP 收紧**：生产 `script-src` 移除 `'unsafe-eval'`（React19/Next15/mermaid/katex
  运行期均不需要）；开发模式 HMR 依赖 eval 仅开发保留。
- **CORS 白名单收口**：允许主机名改由 `CORS_ALLOWED_HOSTNAMES` 环境变量配置
  （默认值保留历史域名与服务器 IP 兼容存量部署），换域名不再需要改代码。

### 验证

- typecheck 0 错误；vitest **53 文件 / 498 用例**全绿（+5 金额精度用例）；prisma schema valid。
- 版本 1.18.2/b37 → **1.19.0/b38**，四处版本一致自检通过。

---

## [1.18.2] - 2026-09-30

### Added（网站备案信息 · ICP / 工信部备案号 / 公安联网备案号）

- **备案信息补全**：`lib/icp.ts` 扩展为四类编号的单一来源 —— 网站 ICP `赣ICP备2024031528号-2`
  （www.yuanabd.cn 主站及 travel-notes / learn 子域名共用）、App ICP `赣ICP备2024031528号-4A`、
  工信部备案号 `30178737190355077`、公安联网备案号 `粤公网安备44010602017246号`（编号 44010602017246）。
- `components/IcpLicense.tsx` 改为四行「标签 + 可点击编号」：ICP（网站）→ 工信部备案系统、
  ICP（App）→ 工信部备案系统、工信部备案号 → 备案查询页、公安备案号（带官方警徽标识
  `public/brand/gongan-beian.png`）→ 全国互联网安全管理服务平台查询页；末行保留工信部备案系统网址。
  展示位沿用 6 处：账号设置 →「关于」、登录页、移动端首页底部、门户首页页脚、全站页脚、APK 下载页。
- **安装包内同步**：`android/app/src/main/res/values/strings.xml` 增加 `site_icp_license` /
  `miit_filing_no` / `police_filing_no` / `police_filing_query_url`；`AndroidManifest.xml` 同步增加
  4 条 `<meta-data>`；`public/icp-license.txt` 补全网站 + App 备案信息。
- **主站 www.yuanabd.cn**：新增 `site/yuanabd/filing-snippet.html`（页脚备案信息片段，唯一版本来源），
  `site/yuanabd/README.md` 增加部署目标（`public/brand/gongan-beian.png` →
  `/var/www/yuanabd/img/gongan-beian.png`）与 index.html 改动 ⑥。

### Changed

- 版本 1.18.1/b36 → **1.18.2/b37**（`bump-version.cjs`；typecheck 0 错误、vitest 493/493）。

### 验证

- APK：26,271,954 字节、SHA-256 `8a54cc5e…`；`aapt2 dump resources` 可读出四个编号，
  AndroidManifest 6 条 meta-data 均在；`apksigner` 证书 MD5 仍为 `f67e57f3…`（与备案登记一致）。

### 部署（2026-09-30）

- 生产 `.env` 对齐 1.18.2 / 37 + 新更新说明，`server-rebuild.sh` 重建上线：`/api/health` 与
  `/api/version` 均返回 1.18.2 / 37，`/download` 页直出四项备案信息与警徽。
- APK 复发布至 https://travel-notes.yuanabd.cn/downloads/tiantu.apk（新副本 `tiantu-20260930-v1.18.2-b37.apk`）。
- 主站 www.yuanabd.cn 页脚上线（index.html 备份于服务器 `~/backups/`）。
- learn.yuanabd.cn（learn-workbench 项目，不在本仓库）：落地页页脚已加入同一备案信息并**已上线**
  （其 apt 源 debian-security 502 + 服务器带宽限制使常规 Docker 重建不可用，改用「以现有镜像为基座
  只重编译 Next 产物」的快路径，约 40 秒完成，详见改动记录）。

---

## [1.18.1] - 2026-09-29

### Added（App 备案号 · 赣ICP备2024031528号-4A）

- **应用内展示备案编号**：按《工业和信息化部关于开展移动互联网应用程序备案工作的通知》与各应用商店
  上架规范（小米《APP备案编号的应用内展示指南》、华为/OPPO/vivo/应用宝同源要求）——App 内需在
  **显著位置**展示 App 备案编号，且编号可点击（或在编号下方）跳转工信部备案系统
  https://beian.miit.gov.cn/ 供用户查询。新增：
  - `lib/icp.ts`：备案号与备案系统地址单一来源（`ICP_LICENSE` 默认 `赣ICP备2024031528号-4A`；
    可用 `NEXT_PUBLIC_ICP_LICENSE` / `NEXT_PUBLIC_ICP_LICENSE_QUERY_URL` 覆盖）。
  - `components/IcpLicense.tsx`：统一展示块（「ICP 备案号：<编号>」+「工信部备案查询：<网址>」，
    两个链接均可跳转备案系统；根节点带 `data-icp-license`）。
  - 展示位置 6 处：**账号设置 →「关于」（新，规范推荐位）**、登录页（App 首屏）、移动端首页底部、
    门户首页页脚、全站桌面页脚、APK 下载页。
- **安装包内可扫描**：`android/app/src/main/res/values/strings.xml` 新增 `icp_license` /
  `icp_license_query_url` 字符串资源；`AndroidManifest.xml` 的 `<application>` 新增同名
  `<meta-data>`（运行期亦可用 `PackageManager.GET_META_DATA` 读取）；新增 `public/icp-license.txt`
  随静态壳打进 APK 的 `assets/public/icp-license.txt` —— 应用市场/备案核验扫描安装包
  （resources.arsc / AndroidManifest / assets / 内嵌 HTML）时均可读到备案号。
- 「账号设置 →「关于」」区块同时展示当前版本（v1.18.1 · build 36）。

### Changed

- 版本 1.18.0 / build 35 → **1.18.1 / build 36**（`scripts/bump-version.cjs`，`verify-version.cjs` 通过），
  OTA 更新说明同步更新（`app/api/version/route.ts`）。
- 重新打包 release APK：沿用 `tiantu-release.keystore`，包名 `com.tiantu.app`、签名与公钥不变，
  继续与已通过的 App 备案信息一致。

### 验证

- `npx tsc --noEmit` 0 错误；`npx vitest run` **493/493（52 files）** 通过。
- 静态壳 `www/`：20 个文件含备案号明文（15 个 HTML + 4 个 JS chunk + `icp-license.txt`）。

### 部署（2026-09-30）

- 生产 `.env` 的 `APP_VERSION` / `APP_BUILD_NUMBER` / `APP_CHANGELOG` 同步为 1.18.1 / 36（改动前已备份），
  `scripts/server-rebuild.sh` 完成 Docker 重建上线：`/api/health` 返回 1.18.1/36，`/download` 页直出备案号。
- APK 重新打包并复发布至 https://travel-notes.yuanabd.cn/downloads/tiantu.apk（SHA-256 `ae65426a…`，
  签名 MD5 `f67e57f3…` 与备案登记一致）。

---

## [1.18.0] - 2026-09-27

### Added（移动端 UI 精修 3.0 · 空间与旅行圈）

- **旅行圈真实类型筛选**：修复话题 chips 假筛选（点了没有任何效果）——改为按同行关系
  （独旅/与TA/与家人/与朋友/与闺蜜/结伴）真实过滤，API 新增 `travelType` 参数，
  recommended 热度缓存按类型隔离；筛选空态文案与「看全部」按钮配套。
- **旅行圈无限滚动**：IO 哨兵自动加载下一页（手动按钮保留兜底），底部加载/到底状态行。
- **空间退出确认 iOS 化**：`window.confirm` 浏览器弹窗 → ActionSheet（破坏性项红色）。
- **空间详情滚动折叠栏**：hero 滚出视口时浮出空间主题色毛玻璃 compact 栏（返回+空间名+设置）。
- **图片加载淡入**：通用 `m-img-fade`（onLoad 渐显，reduce-motion 直出），旅行圈封面与空间相册接入。
- **按压与 toast 统一**：空间卡片/详情行接入全局按压弹簧体系；列表页自绘 toast 收敛到全局
  ToastHost；旅行圈卡片接入 `m-card-pressable`。
- **清理**：旅行圈 3 处 `!important` 尺寸覆盖（违反规范 §2.6-10）移除；日期区间改为中文格式
  （`1月1日 – 1月5日`，跨年带年份）。

---

## [1.17.0] - 2026-09-27

### Added（移动端 UI 精修 2.0 · 流畅感与原生感）

- **按压弹簧化**：所有可按元素统一「按下快进（0.1s ease-out）、松手弹簧过冲回弹（0.4s spring）」两相位；档位收敛为控件 0.96 / 大卡片 0.985 / 小按钮 0.94。
- **BottomSheet / SideDrawer 2.0**：把手与标题栏跟手拖拽（内容区滚动不受干扰）、下拉过半或快速一甩直接关闭、不足弹簧回弹；进退场统一弹簧动画——关闭不再「瞬间消失」。13 个使用方零改动自动受益。
- **方向感知页面转场**：进入更深路径新页右滑入（push）、返回时左滑回（pop）、Tab 间轻淡入；底部 Tab 栏移出转场层，从此可以安全使用 translate 动画。
- **大标题滚动折叠**：`LargeTitle` 滚出视口顶部时浮出毛玻璃 compact 栏（返回键 + 居中小标题），16 处页面自动获得；IntersectionObserver 哨兵实现，零 scroll 监听。
- **下拉刷新 iOS 化**：纯 spinner 跟手旋转（进度 ×180°）、去掉文字标签、松手弹簧收位。
- **原生状态栏随主题联动**：新增 `@capacitor/status-bar`，图标风格与底色随暗色模式实时切换；新增 `@capacitor/keyboard`（resize=native）避免键盘遮挡弹层输入。
- **边缘右滑返回**：二级页（旅行详情/帖子详情/设置/收藏/通知/关注粉丝）左缘右滑即整页+Tab 栏方向性退场返回。

### Fixed
- `viewport-fit=cover` 缺失导致 `env(safe-area-inset-*)` 恒为 0（刘海/挖孔屏安全区退化为固定 20px）——已导出 Next viewport 配置。
- `theme-color` 写死 `#FAF6EE` 不随暗色切换——现由 `ThemeColorSync` 实时同步（Web meta + 原生状态栏共用一个观察器）。
- Android 12+ 拉伸 overscroll 效果未禁用——`overscroll-behavior-y: none`；全局 `touch-action: manipulation` 消灭 tap 高亮/双击延迟；界面框架禁长按选中。
- 方向转场动画 `fill-mode: both` 残留 transform 会把容器内 `position:fixed` 后代（折叠栏）锚点拖走——动画播完即移除动画类。

---

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
