# Travel-Notes 3.0「银河记忆」大版本设计方案

> 版本：V1 · 下一代大版本总体规划  
> 日期：2026-08-18  
> 输入文档：
> 1. 《Travel-Notes 相册视觉系统优化方案 V3》（E:\Codex_output_files\Travel-Notes_相册视觉系统优化方案_V3.md）
> 2. 《Travel-Notes 社交圈 + Offline First 设计方案 V2》（微信文档）
> 3. 本仓库代码现状（v2.5.0 · commit 2ebd3b2 · prisma/schema.prisma）
>
> **本方案的核心结论（先后顺序，先讲清楚）：**
>
> ```text
> 先：相册视觉系统（Stage 1）→ 打好 Design Tokens / 组件库 / 数据地基
> 后：旅行圈社交（Stage 2）→ 在相册地基上长出来的版本最大亮点
> 再：Offline First（Stage 3）→ 云端存储（Stage 4）→ 性能验收发布（Stage 5）
> ```
>
> 原因只有一句话：**旅行圈 Feed 上每一张卡片、每一张照片、每一个互动按钮，都要复用相册阶段沉淀的 TravelFilmCard / AlbumPhoto / PhotoViewer / Design Tokens。相册不先做好，旅行圈就是空中楼阁，做了也要返工。**

---

# 一、版本定位与设计方向

## 1.1 版本定位

Travel-Notes 3.0 不是"加一个论坛"，而是：

> **把 Travel-Notes 从"私人旅行记录工具"，升级为"私人旅行记忆 + 旅行灵感社区"的完整产品。**

- 私人空间（Private World）：记录、整理、保存自己的旅行。视觉 = 银河 + 像素 + 照片。
- 旅行圈（Social World）：发现、浏览、互动、收藏别人的旅行。视觉 = 与私人空间**同一套 Design System**，只多一层轻量社交元素。

一句话产品定位（沿用社交方案）：

> **Travel-Notes：记录属于我们的旅行，也看看别人眼中的世界。**

## 1.2 设计读取（Design Read）

按 design-taste-frontend 流程给出设计读取：

> **Reading this as：私人数字旅行档案 + 沉浸式相册 + 旅行灵感社区，受众是情侣（私人）并扩展为旅行爱好者（公开），语言是「低噪音银河氛围 + 像素记忆符号 + 真实照片叙事」，是"旅行记忆产品"，不是"社交平台"。**

## 1.3 三轴设定

```text
相册模块（私人世界）
  DESIGN_VARIANCE : 6    偏移但克制（照片墙错落、书架、唱片环轨保留，不堆叠）
  MOTION_INTENSITY: 4    流畅低噪（星星呼吸、淡入、轻跳入；禁止高频闪烁/自动旋转）
  VISUAL_DENSITY  : 3    画廊感（给照片留白，装饰只出现一次、只在一个层级）

旅行圈（社交世界）
  DESIGN_VARIANCE : 5    内容优先
  MOTION_INTENSITY: 3    克制
  VISUAL_DENSITY  : 5    正常信息密度（Feed 可滚动，但不做短视频式强刺激）
```

## 1.4 设计方向五条（本大版本的总纲）

1. **一个产品，两个世界，一套设计系统**：私人空间与旅行圈共用相册阶段建立的 Token 与组件，社交元素是"长在旅行视觉上"的，不是另一套 UI。
2. **照片永远是一级内容**：任何组件中，照片只允许被一层 UI 覆盖（hover 态可以，常驻态不行）；常驻角标每张照片最多 1 个（同步状态或 Day 序号，二选一）。
3. **像素只做符号，银河只做氛围**：Zpix 只用于日期/DAY/城市/标签；星点透明度 ≤0.5；文字不直接压在星空上（中间隔半透明内容层）。
4. **社交克制**：点赞/评论/收藏用 图标 + 数字（lucide 图标，禁用 emoji 按钮），不加红点轰炸、不做热搜/直播/排行榜/短视频流。旅行圈首屏 = 旅行杂志 + 记忆卡片。
5. **Offline First 是横向能力，优先喂给相册**：照片是离线价值最大的数据（几百张原图），所以移动端相册先做本地媒体管线，社交互动同步紧随其后。

---

# 二、为什么必须"先相册、后旅行圈"（顺序论证）

| 维度 | 相册先行带来的收益 | 顺序颠倒的代价 |
| --- | --- | --- |
| 视觉一致性 | 旅行圈 Feed/详情/主页 直接复用 TravelFilmCard、AlbumPhoto、PhotoViewer、tokens、z-index、动效 | 旅行圈先做会自造一套 UI，与相册两张皮，最后要推倒重来 |
| 数据一致性 | 双相册合并后"一个相册 = 一次旅行"，公开旅行 = 把旅行档案发布成 TravelPost，数据源干净 | 先做社交没有统一的内容实体，Feed 与相册各自为政 |
| 工程一致性 | 相册阶段先定 token/字体/圆角/阴影/无障碍规范，社交 UI 直接继承 | 两套规范并存，维护成本翻倍 |
| 体验一致性 | 用户先被"自己的相册"打动，才愿意公开分享；私人体验打磨到极致是社交的前提 | 用户还没爱上自己的相册，就推它去社交，转化差 |
| 版本节奏 | M1 相册完成即是一个可交付的 3.0-alpha，风险可控 | 一次上太多东西，出了 bug 无法定位是相册还是社交 |

> 结论：**Stage 1 相册视觉系统是 Stage 2 旅行圈的"原料工厂"和"质量门禁"，顺序不可颠倒。**

---

# 三、现状基线（代码里已有什么 / 缺什么）

## 3.1 已经具备（可直接复用/演进）

| 能力 | 现状 | 对 3.0 的价值 |
| --- | --- | --- |
| 多用户 | `User`（username/email/anniversaryStart） | 社交身份基础 |
| 情侣空间 | `Space` / `SpaceMember`（OWNER/MEMBER/VIEWER） | 关注/粉丝可挂靠，私人边界 |
| 旅行 | `Travel`（含 `visibility` + `isPublic` + `status` + cover + days + memories + expenses） | 公开机制可基于此演进，不用另起炉灶 |
| 媒体 | `Media`（含 `hash` / `storageKey` / `width/height` / `variants` / `visibility` / `isPublic`） | 媒体管线与去重基础已有 |
| 相册 | `Album` / `AlbumMedia`（含 `visibility` / `isPublic`） | 双相册合并的数据落点 |
| 沉浸式相册 | `/album` 双模式（银河 Three.js + 像素书架/拍立得） | 3.0 相册视觉的起点 |
| 匿名点赞 | `Like`（visitorId 维度，targetType/targetId） | 需升级为用户级 PostLike |
| 碎碎念 | `Moment` / `PhotoMessage`（含 isPublic） | 可并入"我的空间"内容流 |
| 移动端壳 | Capacitor Android 已接入 | Offline First 的宿主 |

## 3.2 缺失（3.0 需要新建）

```text
社交域：TravelPost / PostLike / PostFavorite / Comment / CommentLike / UserFollow / Notification / Report
同步域：SyncRecord（本地）/ SyncQueue（云端队列）
存储域：UserStorage（用户配额）
```

## 3.3 三个关键工程事实

1. **`Travel.visibility` 已存在**：公开机制不是从零设计，而是把 `visibility/isPublic` 演进为三态（仅自己 / 我的 Space / 公开到旅行圈），并让 `TravelPost` 只承载"公开视图"。
2. **`Media.hash/storageKey/variants` 已存在**：缩略图分层、Hash 去重、对象存储键都有字段基础，Stage 4 主要做"真正写入对象存储 + 变体生成"。
3. **`Like` 是匿名 visitorId 模型**：社交版必须升级为"用户级 + 唯一约束"（`@@unique([postId, userId])`），旧 Like 数据保留给碎碎念/博客用，不迁移。

---

# 四、总体版本规划（Master Plan 总览）

```text
Stage 0  基线审计           约 1 周     → 输入清单
Stage 1  相册视觉系统        约 3-4 周   → M1 · 3.0-alpha（必做，旅行圈地基）
Stage 2  旅行圈社交          约 4-5 周   → M2 · 3.0-beta（版本最大亮点）
Stage 3  Offline First      约 3-4 周   → M3 · 3.0-rc
Stage 4  云端存储优化        约 2-3 周   → M3.5
Stage 5  性能验收 + 发布     约 1 周     → M4 · 3.0 正式版
```

里程碑：

| 里程碑 | 内容 | 版本 |
| --- | --- | --- |
| M1 | 相册视觉系统完成：tokens、组件库、双相册合并、旅行档案、相册移动端 | 3.0-alpha |
| M2 | 旅行圈 MVP 闭环：公开 → Feed → 详情 → 点赞/评论/收藏 → 用户主页 | 3.0-beta |
| M3 | Offline First：SQLite、SyncQueue、自动同步、同步中心、云端备份 | 3.0-rc |
| M3.5 | 对象存储 + 分片上传/断点续传/Hash 去重/CDN/配额 | 3.0-rc |
| M4 | 性能与无障碍验收全过，正式发布 | 3.0 |

---

# 五、Stage 1：相册视觉系统（先行 · 3-4 周）

> 完整规格见《相册视觉系统优化方案 V3》。这里只列 Stage 交付物与验收，执行以 V3 为准。

## 5.1 交付物

- **1.0 审计基线（1 天）**：全页面截图（桌面/移动/明暗）、硬编码色值清单、双相册数据流梳理、四套风格归属表。
- **1.1 Design Tokens（3-5 天）**：相册暗色 `--album-*` token 组（含唯一强调色琥珀金 `#e8b06a`、文字三级、语义同步态色）、字体角色表（Zpix 只做符号）、圆角/发光/z-index 层级表、动效参数表；全站四套风格收敛为 travel 暖色 + 相册暗色两套皮肤。
- **1.2 相册组件库（5-8 天）**：`AlbumPhoto`、`AlbumDayDivider`、`PhotoViewer`（全屏：左右切换/双指缩放/EXIF/长按保存）、`GalaxyBackground`、`PixelBadge/PixelIcon`、**`TravelFilmCard`（card/hero/strip 三变体）** —— 这是 Stage 2 旅行圈的原料。
- **1.3 双相册合并（3-5 天）**：`/album` 为唯一前台相册入口，`/albums` 转 admin 专属或重定向；打通"城市相册（Post 图片聚合）"与 `Album/AlbumMedia` 模型，确立"一个相册 = 一次旅行/一座城市"。
- **1.4 旅行档案（5-8 天）**：Travel Film 档案视图、Day 标记/地点标签/日期标签、旅行时间线（像素节点）、旅行星图（地图城市连线）、Space 共同星图。
- **1.5 相册移动端 + 本地媒体管线（并行 3-5 天）**：移动端默认全屏照片流 + 横向城市条；缩略图（WebP ≤320px）/展示图/原图三级 + SHA-256 去重；同步状态角标（✓/↑/☁/!）落地为像素符号。

## 5.2 M1 验收标准

- [ ] `/album` 与 `components/album/**` 无裸 `#` 色值，全站只有两套皮肤
- [ ] `TravelFilmCard` 三变体可独立渲染并被至少 3 个页面复用
- [ ] 导航只有一个相册入口；后台新建相册可在 `/album` 浏览
- [ ] 任一城市可浏览完整档案（封面 → 相册 → DAY 分段 → 时间线 → 地图）
- [ ] 照片每张最多 1 个常驻角标；Zpix 不出现在正文；星点透明度 ≤0.5
- [ ] 移动端双指缩放可用；`prefers-reduced-motion` 全组件降级

---

# 六、Stage 2：旅行圈社交（版本亮点 · 4-5 周）

> 完整规格见《社交圈 + Offline First 设计方案 V2》§5-14、§28-31。这里把"在相册地基上实现"的衔接点写清楚。

## 6.1 数据模型（Prisma · 先 Schema 后页面）

新增模型（唯一约束防重复互动）：

```text
TravelPost       —— 公开视图（postId 关联 Travel；含 visibility/publishedAt/cover/title/summary/author）
PostLike         —— @@unique([postId, userId])
PostFavorite     —— @@unique([postId, userId])
Comment          —— 一级评论 + 回复（parentId），status: VISIBLE/HIDDEN/DELETED/PENDING
CommentLike      —— @@unique([commentId, userId])
UserFollow       —— @@unique([followerId, followingId])
Notification     —— 点赞/评论/回复/收藏/关注
Report           —— 举报类型 + status
```

原则（沿用社交方案 §5/§7）：**`Travel` 与 `TravelPost` 解耦**；用户公开的是 `TravelPost`，不是整个 Space；不知道 postId 就永远读不到私人数据。

## 6.2 公开权限模型

```text
Travel.visibility:  PRIVATE（仅自己）/ SPACE（我的 Space）/ PUBLIC（公开到旅行圈）
公开 → 生成/更新 TravelPost → 进入旅行圈 → 所有人可看 → 可点赞/评论/收藏
```

## 6.3 Social API

- 列表：推荐（热度分 `likes×1 + comments×3 + favorites×4 + freshness 衰减`）/ 最新 / 热门 / 关注
- 互动：POST/DELETE like、favorite；GET/POST comment + reply
- 关系：follow/unfollow、粉丝列表、关注列表
- 治理：report、block、notification 列表 + 已读

## 6.4 旅行圈 UI（全部复用 Stage 1 组件）

| 页面 | 构成 | 复用的 Stage 1 产物 |
| --- | --- | --- |
| 旅行圈首页 | 顶部 Tab（推荐/最新/热门/关注）+ Feed | `TravelFilmCard`（card 变体）+ `AlbumPhoto` |
| 旅行详情 | 现有旅行详情 + 底部互动栏 | `PhotoViewer`、`AlbumDayDivider`、`SocialBar` |
| 用户主页 | 头像 + 简介 + 统计 + 公开旅行网格 | `TravelFilmCard`（card）、`CountUp` |
| 移动端沉浸流 | 上下滑动切换旅行（增强模式，非首版） | `PhotoViewer` 手势体系 |

## 6.5 社交按钮规格

- `SocialBar` 双变体：`on-light`（travel 语义色）/ `on-dark`（album 玻璃暗色），图标 + 数字（`tabular-nums`），lucide `Heart/MessageCircle/Bookmark`。
- 点击动画：仅 `scale 1 → 0.85 → 1` 一次 + 状态色切换（保留 LikeButton 的乐观更新 + 回滚逻辑）。
- 评论输入用 Bottom Sheet，不跳页；评论面板在相册/档案沉浸场景用自建轻量组件，博客页保留 Giscus。

## 6.6 治理

通知中心（点击跳转）、举报（类型 + 状态）、屏蔽用户（Feed 过滤）。后台新增 `/admin/social`（posts/comments/reports/interactions）与统计卡片。

## 6.7 M2 验收标准

- [ ] 私人相册 → 公开 → 出现在旅行圈 Feed → 可点赞/评论/收藏 → 收藏列表可见，整链路视觉统一为 `TravelFilmCard`
- [ ] 服务端权限验证：未公开的 Travel/Media 即使知道 ID 也 403
- [ ] 点赞/收藏/关注重复点击不产生重复记录（唯一约束 + 幂等）
- [ ] 用户 B 只能读取用户 A 的 PUBLIC 数据
- [ ] 社交页面与相册视觉一致：无红点轰炸、无热搜/直播/排行榜

---

# 七、Stage 3：Offline First（3-4 周）

> 顺序说明：移动端相册的本地媒体管线已在 Stage 1.5 落地；Stage 3 把它扩展为全应用 Offline First（社交互动 + 旅行数据 + 结构化数据）。

## 7.1 交付物

- **SQLite 本地库**：Travel/TravelDay/Memory/Album/Comment/Like/Favorite/SyncQueue/MediaMetadata（不存图片二进制）。
- **本地文件**：原图/缩略图/视频 → App Storage；SQLite 只存 `localPath/remoteUrl/sha256/mimeType/size/syncStatus`。
- **SyncQueue**：`entityType/entityId/operation(CREATE|UPDATE|DELETE|UPLOAD_MEDIA)/payload/retryCount/status`；写本地 → UI 立即更新 → 入队 → 网络可用自动上传 → 失败重试。
- **网络状态检测 + 自动同步**：恢复联网自动触发；`document.hidden`/App 前后台切换触发。
- **冲突策略**：普通字段 LWW（updatedAt 最大胜出）；媒体 Hash + ID 去重；评论/点赞/收藏操作日志合并，不简单覆盖。
- **同步状态 UI**：每张照片右下角 1 个状态符号（✓/↑/☁/!/⚠，图标 + 颜色双通道）；设置页"数据与同步" + 独立同步中心（已同步/上传中/等待/失败+重试）。

## 7.2 M3 验收标准

- [ ] 飞行模式下可浏览本地相册、照片、留言并新增记录；联网后 SyncQueue 自动上传
- [ ] 同步中心准确显示各项数量与状态；失败项可一键重试
- [ ] 重复同步不产生重复数据（Hash 去重 + 幂等）
- [ ] 断网重连后无数据丢失或重复

---

# 八、Stage 4：云端存储优化（2-3 周）

- 对象存储：MinIO / 阿里云 OSS / Cloudflare R2 / S3 兼容（项目已有 `@aws-sdk/client-s3` 依赖与存储抽象，直接扩展）。
- 对象路径：`/users/{userId}/media/{mediaId}.webp`。
- 图片管线：原图 → 压缩 → 缩略图 WebP → 展示图 WebP/AVIF；大文件分片上传 + 断点续传 + 失败重试 + Hash 去重。
- 新增 `UserStorage`（配额）与存储统计；后台 `/admin/storage`（media/usage）。
- 验收：10MB+ 图片上传在弱网可断点续传；重复图片不重复占存储。

---

# 九、Stage 5：性能与无障碍验收 + 发布（1 周）

- Lighthouse 桌面 + 移动：LCP < 2.5s / INP < 200ms / CLS < 0.1
- 粒子预算表实测（桌面 ≤25000 / 移动 ≤12000 / DPR 2 / 1.5）
- 对比度审计（AA）、reduced-motion 全场景、键盘可达、focus-visible
- 预检清单（V3 §11）：照片每张最多 1 常驻角标、Zpix 不用于正文、星点 ≤0.5、无高频闪烁、无 `window.addEventListener('scroll')`
- 截图回归（对照 Stage 0 存档）：噪音下降、照片更突出
- CHANGELOG + 版本发布 v3.0

---

# 十、设计方向细化（两份方案的融合点）

## 10.1 旅行圈 Feed 的"旅行杂志"形态

```text
┌──────────────────────────────┐
│  旅行圈                 🔍    │
│  推荐   最新   热门   关注     │
│                              │
│  ┌────────────────────────┐  │
│  │   [TravelFilmCard hero] │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   [TravelFilmCard card] │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

首屏是一张大图（hero）+"翻阅别人旅行相册"的卡片流，不是信息流密度。这是旅行杂志 + 记忆卡片，不是短视频平台。

## 10.2 相册与旅行圈的数据/视觉闭环

```text
我的相册（相册视觉系统）
   ↓ 选择公开
TravelPost（社交数据模型）
   ↓
旅行圈 Feed（TravelFilmCard）
   ↓
点赞 / 评论 / 收藏（SocialBar，相册视觉风格）
   ↓
收藏别人的旅行 → 我的灵感
   ↓
开始下一次旅行 → 继续记录
```

## 10.3 同步状态的视觉一致性

相册照片角标（✓/↑/☁/!）与设置页"数据与同步"、同步中心使用同一套语义符号与颜色，形成"数据健康感"的产品记忆点（像素符号语言延伸到系统状态）。

---

# 十一、关键依赖与风险

| # | 风险 | 应对 |
| --- | --- | --- |
| R1 | 双相册合并涉及数据迁移 | Stage 1.3 先做"路由与导航收敛"，数据打通采用渐进迁移（旧数据可回退），不一次性全量切换 |
| R2 | `Travel` 与 `TravelPost` 耦合 | 严格解耦：TravelPost 只存"公开视图快照"（cover/title/summary/计数），详情实时读 Travel 的公开部分 |
| R3 | 匿名 Like 升级为用户 Like | 旧 Like 保留给碎碎念/博客；社交互动用新 PostLike，不做旧数据迁移 |
| R4 | 评论自建 vs Giscus | 沉浸场景自建轻量评论；博客页保留 Giscus；两套并存，互不侵入 |
| R5 | Offline First 复杂度前置 | Schema 与 SyncQueue 设计必须先于页面（社交方案 §40 明确"不要跳过 Schema 直接写页面"） |
| R6 | Capacitor 与 next/image / 本地路径 | 移动端媒体用本地 file:// 协议路径 + Capacitor 文件插件；`next/image` 仅用于远程 URL |
| R7 | 一个版本做太多 | 用里程碑切版本：alpha（相册）→ beta（旅行圈）→ rc（离线+云存储），每阶段可独立验收 |

---

# 十二、实施节奏（周粒度建议）

| 周 | Stage | 关键交付 | 里程碑 |
| --- | --- | --- | --- |
| W1 | 0 | 审计基线：截图、硬编码清单、双相册梳理 | - |
| W2-3 | 1.1-1.2 | Design Tokens + 组件库（含 TravelFilmCard） | - |
| W4 | 1.3 | 双相册合并 | - |
| W5-6 | 1.4-1.5 | 旅行档案 + 相册移动端/媒体管线 | **M1 · 3.0-alpha** |
| W7 | 2.1-2.2 | Prisma Schema（Social 域）+ 公开权限 | - |
| W8-9 | 2.3-2.4 | Social API + 旅行圈 UI | - |
| W10 | 2.5-2.7 | 互动 + 用户主页/关注 + 通知/治理 | **M2 · 3.0-beta** |
| W11-13 | 3 | SQLite + SyncQueue + 同步中心 + 云端备份 | **M3 · 3.0-rc** |
| W14-15 | 4 | 对象存储 + 分片/断点/去重 + 配额 | M3.5 |
| W16 | 5 | 性能/无障碍验收 + 回归 + 发布 | **M4 · 3.0** |

> 注：团队单人开发时总工期约 16 周（4 个月）；若 Stage 3/4 可外包或复用现成库（Capacitor SQLite、S3 SDK 已有），可压缩到 12-13 周。各阶段独立验收，任何阶段都可单独交付。

---

# 十三、发布门禁（验收清单）

- [ ] M1-M4 全部里程碑验收标准通过（§5.2 / §6.7 / §7.2 / §8 / §9）
- [ ] 相册与旅行圈共用同一套 Design Tokens，无两套 UI
- [ ] 隐私红线：未公开数据严格隔离（ID 猜测也拿不到）
- [ ] 数据安全：SyncQueue 幂等、Hash 去重、冲突策略生效、云端备份可恢复
- [ ] 性能：Lighthouse 三项达标，粒子预算不超
- [ ] 无障碍：AA 对比度、reduced-motion、键盘可达
- [ ] 内容治理：举报/屏蔽可用，后台可审核
- [ ] CHANGELOG 更新，v3.0 发布

---

# 附录 A：两份方案与本方案的衔接映射

| 本方案 Stage | V3 相册方案 Phase | 社交方案 Phase | 说明 |
| --- | --- | --- | --- |
| Stage 0 | Phase 0 审计基线 | - | 共用 |
| Stage 1.1-1.3 | Phase 1-3（tokens/组件/双相册合并） | - | 相册先行 |
| Stage 1.4 | Phase 4 旅行档案 | - | 相册先行 |
| Stage 1.5 | Phase 6（相册部分） | - | 相册移动端 + 媒体管线 |
| Stage 2 | Phase 5（旅行圈融合的 UI 规格） | Phase 1 MVP + Phase 2 关系治理 | 社交在相册组件上实现 |
| Stage 3 | Phase 6（同步状态角标规格） | Phase 3 Offline First | 横向能力 |
| Stage 4 | - | Phase 4 云端存储优化 | 横向能力 |
| Stage 5 | Phase 7 性能/无障碍验收 | - | 共用 |

# 附录 B：Prisma 新增模型草案（关键约束）

```prisma
model TravelPost {
  id           Int      @id @default(autoincrement())
  travelId     Int      @unique
  travel       Travel   @relation(...)
  authorId     Int
  visibility   Visibility @default(PUBLIC)
  title        String
  summary      String?
  coverMediaId Int?
  publishedAt  DateTime @default(now())
  likeCount    Int      @default(0)
  commentCount Int      @default(0)
  favoriteCount Int     @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  likes        PostLike[]
  favorites    PostFavorite[]
  comments     Comment[]
  reports      Report[]
}

model PostLike {
  id     Int @id @default(autoincrement())
  postId Int
  userId Int
  createdAt DateTime @default(now())
  @@unique([postId, userId])
}

model PostFavorite {
  id     Int @id @default(autoincrement())
  postId Int
  userId Int
  createdAt DateTime @default(now())
  @@unique([postId, userId])
}

model Comment {
  id        Int      @id @default(autoincrement())
  postId    Int
  userId    Int
  parentId  Int?
  content   String
  status    CommentStatus @default(VISIBLE)  // VISIBLE/HIDDEN/DELETED/PENDING
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  likes     CommentLike[]
}

model UserFollow {
  id          Int @id @default(autoincrement())
  followerId  Int
  followingId Int
  createdAt   DateTime @default(now())
  @@unique([followerId, followingId])
}

model Notification {
  id        Int @id @default(autoincrement())
  userId    Int
  actorId   Int
  type      NotificationType  // LIKE/COMMENT/REPLY/FAVORITE/FOLLOW
  refType   String
  refId     Int
  read      Boolean @default(false)
  createdAt DateTime @default(now())
}

model Report {
  id        Int @id @default(autoincrement())
  postId    Int
  reporterId Int
  reason    String
  status    ReportStatus @default(PENDING)  // PENDING/REVIEWED/DISMISSED/ACTIONED
  createdAt DateTime @default(now())
}
```

# 附录 C：一句话收尾

> 3.0 的顺序只有一条：**相册先成体系（Token + TravelFilmCard + 档案 + 移动端），旅行圈再在上面长出来（公开 → Feed → 互动 → 关系 → 治理），最后用 Offline First 与云端存储把"私人记忆"和"社交灵感"都焊死在可靠的数据地基上。相册是根，旅行圈是花，根先扎深，花才开得稳。**
