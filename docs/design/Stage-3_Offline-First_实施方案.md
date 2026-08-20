# Stage 3：移动端完整化 + Offline First 完整设计方案（V2）

> 版本：V2 · 2026-08-20（V1 为纯 Offline First，本版纳入「壳离线 / 完整 App / 后台能力模块化」三条新诉求）
> 所属：Travel-Notes 3.0「银河记忆」大版本 · Stage 3
> 里程碑：M3 · 3.0-rc
> 前置：Stage 0/1/2 已完成；Stage 1.5（移动端本地媒体管线）未落地，并入本阶段。

---

## 一、目标与范围（修订）

本阶段把「甜途」移动端从“网页壳”升级为“完整功能的离线优先 App”，共四条目标：

1. **完整 App**：移动端具备与 Web 端对等的核心功能，而不是只嵌一个网页。
2. **壳离线**：断网也能打开 App 首页（本地壳 + 本地数据），不再白屏。
3. **后台能力模块化**：移动端不设 `/admin` 后台；管理/设置能力按权限下沉到各自功能模块内。
4. **数据离线**：SQLite + 媒体本地管线 + SyncQueue + 自动同步 + 同步状态 UI。

> 关键洞察：第 3、4 条天然一体——「管理动作」（新建/编辑/删除旅行、相册、碎碎念）本质上就是离线可写的写操作，统一走「本地乐观写 → SyncQueue → 联网同步（服务端复检权限）」这一条链路。

---

## 二、总体架构

```text
┌──────────────────────────────────────────────┐
│  本地壳（webDir 打包，离线可启动）              │
│   ├─ React 页面/组件（复用现有 components/）    │
│   ├─ Repository 数据访问抽象层                 │
│   │    ├─ 在线：fetch /api/*（服务端复检权限）  │
│   │    └─ 离线：SQLite / 本地文件              │
│   └─ 模块内「管理/设置」入口（按角色显隐）       │
├──────────────────────────────────────────────┤
│  同步引擎：SyncQueue + 网络检测 + LWW/去重      │
├──────────────────────────────────────────────┤
│  服务器：Next.js API（幂等 + Space RBAC）       │
└──────────────────────────────────────────────┘
```

---

## 三、壳离线（本地壳）方案

现状：`capacitor.config.ts` 里 `server.url = 'http://106.55.2.197'`，App 每次打开都从服务器拉页面，断网即白屏。

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A 本地 webDir 打包 | 前端构建产物打进 `webDir`，App 首启即本地加载；API 走 HTTP | 首启离线可用，最像原生 App | 需把 Next.js 动态/SSR 页面迁到客户端渲染，改造大 |
| B Service Worker 缓存 | 保留远程加载，SW 缓存壳 + 静态资源 + API 响应 | 改动小 | 首次必须联网；iOS WKWebView 对 SW 支持有限 |
| C 混合（推荐） | 本地 webDir 放「离线壳」入口 + Repository 抽象 + 离线优先缓存；分两步：先做 Repository/数据离线，再做壳打包 | 风险可控、渐进 | 需分阶段 |

**推荐 C 的分步落地：**
1. 3.0a：引入 Repository 数据访问抽象，页面不再直接 `fetch('/api/...')`，统一经 Repository（在线 fetch / 离线 SQLite 自动切换）。
2. 3.0b：构建离线壳（本地 `index.html` + 客户端路由），打进 `webDir`；`server.url` 改为仅作为 API base。
3. 3.0c：媒体/数据离线优先缓存 + SW 兜底（可选）。

---

## 四、后台能力模块化（移动端权限与设置）

### 4.1 现状
- 集中式后台：`app/admin/*`（dashboard/travels/albums/moments/social/settings/spaces/anniversaries/audit/setup/new/edit） + `app/api/admin/*`。
- 权限：`requireAuth`（登录即可）+ Space RBAC（`OWNER/MEMBER/VIEWER`，见 lib/modules/space/permissions.ts）。当前 User 无全局 role 字段。

### 4.2 能力矩阵（管理动作 → 所需角色）

| 功能模块 | 管理动作 | 所需角色 |
| --- | --- | --- |
| 旅行记录 | 新建/编辑/删除旅行、天/花费/行程 | OWNER / MEMBER |
| 相册 | 新建/编辑/删除相册、增删照片 | OWNER / MEMBER |
| 碎碎念 | 发布；删除（自己或 OWNER） | MEMBER 起 |
| 留言 | 写留言；删自己的留言 | 所有活跃成员 |
| 社交 | 举报审核、评论隐藏/删除、屏蔽管理 | OWNER |
| 纪念日 | 管理纪念日 | OWNER / MEMBER |
| 设置 | 昵称/头像（仅自己）；纪念日/密码/邮箱/账号名 | 自己 / OWNER |
| 空间 | 邀请/移除成员、角色调整 | OWNER |
| 审计 | 查看审计日志 | OWNER |

### 4.3 权限模型
- 沿用 Space RBAC：OWNER（可管一切）/ MEMBER（可协同编辑内容，不可管账号与设置）/ VIEWER（只读）。
- 单用户模式（无 Space 或仅一人）时，该用户即 OWNER。
- 判定：优先用「是否某 Space 的 OWNER」；若需跨空间全局管理员，再给 `User` 增 `role` 字段（见决策点 D-2）。

### 4.4 管理入口 UI
- 各功能模块页内放「管理/设置」图标入口，仅对授权角色可见（服务端下发 `capabilities` 决定显隐，前端不可信）。
- 形态：编辑/删除用卡片上的小按钮 + 底部抽屉，不用独立后台列表页（符合设计 skill 的「不做列表按钮/后台感」约束）。

### 4.5 API 改造
- 现有 `/api/admin/*` 逐步收敛为「模块化写接口」：`/api/travels/*`、`/api/albums/*`、`/api/moments/*`、`/api/social/*`（后者已存在）。
- 统一鉴权：`requireUserId`（social-route-utils 已有模式）+ `requireSpaceRole`（space/permissions 已有）。
- 服务端每次写都复检权限（防 IDOR）；写接口幂等（复用 Stage 2 唯一约束 + upsert）。
- 离线时写操作走本地 SQLite + SyncQueue，联网后由同步引擎回放，服务端仍复检权限。

---

## 五、本地数据模型（SQLite）

只存结构化快照（不存图片二进制），图片走 Capacitor 文件系统。

| 表 | 说明 | 离线读写 |
| --- | --- | --- |
| Travel / TravelDay | 旅行 + 天 | 读 + 写 |
| Memory | 回忆 / 留言 | 读 + 写 |
| Media | 媒体元数据 | 读 + 写 |
| Album / AlbumMedia | 相册 | 读 + 写 |
| Moment | 碎碎念 | 读 + 写 |
| Comment / Like / Favorite | 社交互动 | 写（操作日志合并） |
| SyncQueue | 同步队列 | 内部 |
| Meta | 版本 / 游标 | 内部 |

通用列：`remoteId`（本地新建为 NULL，同步后回填）/ `updatedAt`（LWW）/ `syncStatus`（SYNCED/PENDING_UPLOAD/PENDING_DOWNLOAD/ERROR）/ `deleted`（墓碑）。

Media 元数据：`localPath / remoteUrl / sha256 / mimeType / size / width / height / syncStatus / takenAt`。

---

## 六、SyncQueue 与自动同步

```text
entityType / entityId / operation(CREATE|UPDATE|DELETE|UPLOAD_MEDIA)
/ payload(JSON) / retryCount / status(PENDING|SYNCING|FAILED) / lastError
```

- 写流程：本地写 → UI 立即更新（乐观）→ 入队 → 联网逐条上传 → 失败指数退避。
- 触发：@capacitor/network 的 networkStatusChange + App 启动/回前台 + visibilitychange。
- 冲突：普通字段 LWW；媒体 sha256 + remoteId 去重；互动操作日志合并。

---

## 七、同步状态 UI

- 照片右下角像素符号：✓ 已同步 / ↑ 待上传 / ☁ 仅云端 / ! 失败 / ⚠ 冲突（图标 + 颜色双通道，沿用 Stage 1 像素语言）。
- 设置模块新增「数据与同步」+ 独立同步中心（已同步/上传中/等待/失败 + 一键重试）。

---

## 八、子阶段拆解（3.0 → 3.7）

| 子阶段 | 内容 | 交付 |
| --- | --- | --- |
| 3.0a 数据访问抽象 | Repository 层（在线 fetch / 离线 SQLite 切换） | lib/repositories/* |
| 3.0b 壳离线 | 本地 webDir 壳打包 + 客户端路由 | capacitor.config.ts / www |
| 3.1 插件接入 | sqlite/filesystem/network + 平台降级 | lib/modules/offline/native/* |
| 3.2 本地 Schema + SyncQueue | 建表 + DAO + 队列 | lib/modules/offline/db.ts / sync-queue.ts |
| 3.3 离线读 + 媒体管线 | 相册/旅行/照片本地缓存；三级缩略 | lib/modules/offline/media.ts |
| 3.4 写队列 + 自动同步 + 冲突 | 离线写 + 队列 + 网络触发 + LWW/去重 | lib/modules/offline/sync-engine.ts |
| 3.5 同步状态 UI | 角标 + 同步中心 + 设置入口 | components/offline/* / app/sync/* |
| 3.6 后台能力模块化 | 模块内管理入口 + 模块化写 API + 角色校验 | app/api/* + 各模块组件 |
| 3.7 移动端验收 | 真机离线/弱网回归 + 权限回归 | 验收清单 |

---

## 九、验收标准（M3 修订）

- [ ] 断网可打开 App 首页并可浏览本地相册/照片/旅行/留言（壳离线 + 数据离线）
- [ ] 离线可新增照片/留言/碎碎念/旅行；联网后 SyncQueue 自动上传且不产生重复数据（sha256 去重 + 幂等）
- [ ] 同步中心准确显示数量与状态；失败项可一键重试
- [ ] 移动端无 `/admin` 入口；各功能模块内可见对应管理入口，且按 OWNER/MEMBER/VIEWER 正确显隐与鉴权
- [ ] 断网重连后无数据丢失或重复
- [ ] Web 端功能不回归（桌面仍可正常使用）

---

## 十、风险与应对

| 风险 | 应对 |
| --- | --- |
| R-1 Next.js SSR 迁客户端渲染（壳离线）| 分步：先 Repository/数据离线，再壳打包；动态路由改客户端路由 |
| R-2 浏览器端与原生端两套通路 | Repository 统一，页面无感 |
| R-3 同步越权/IDOR | 服务端每次写复检权限；SyncQueue 只回填自己名下 remoteId |
| R-4 幂等 | 服务端写接口幂等（唯一约束 + upsert） |
| R-5 复杂度过高 | 首期最小闭环：相册离线读 + 照片/留言/碎碎念/旅行离线写，社交互动后置 |
| R-6 后台能力分散后越权面变大 | 能力矩阵 + capabilities 下发 + 服务端复检，前端只做显隐 |

---

## 十一、目录规划（更新）

```text
lib/repositories/          # Repository 数据访问抽象（在线/离线切换）
lib/modules/offline/
  native/                  # Capacitor 插件封装 + 平台降级
  db.ts / dao/             # SQLite 连接 + 建表 + 各实体 DAO
  sync-queue.ts / sync-engine.ts
  media.ts                 # 媒体本地管线（三级 + sha256）
components/offline/        # 同步角标 / 同步中心
app/sync/                  # 同步中心页面
www/                       # 本地壳构建产物（webDir）
capacitor.config.ts        # 去掉远程 server.url，改本地壳 + API base
```

---

## 十二、待确认决策点（确认后再动代码）

- **D-1 壳离线路线**：本地 webDir 打包（SPA 化，真离线首启）vs Service Worker 缓存（首启需联网）vs 混合（推荐，先数据离线后壳打包）。
- **D-2 全局角色**：沿用「Space OWNER 即管理员」即可，还是给 `User` 增加 `role` 字段做全局管理员？
- **D-3 后台去留**：Web 端是否保留 `/admin`（桌面仍用），还是彻底移除、全站统一走模块内管理入口？
- **D-4 离线可写范围**：首期离线写支持哪些实体（推荐：照片/留言/碎碎念/旅行）；社交互动（点赞/评论/关注）是否纳入首期？
- **D-5 首次启动引导**：离线状态下的 setup 初始化（创建管理员/纪念日）如何引导与降级？