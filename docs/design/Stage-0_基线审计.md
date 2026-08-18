# Stage 0 基线审计报告（Travel-Notes 3.0）

> 日期：2026-08-18  
> 范围：相册视觉系统升级前的代码基线  
> 目标：产出一份可执行的审计清单，作为 Stage 1（视觉统一 · Design Tokens）的 TODO 输入。  
> 方法：静态代码扫描 + 路由/数据流核对 + 运行状态探测。

---

## 0. 结论摘要

1. **双相册系统割裂已被代码证实**：`/album` 数据来自 `Post` 图片按城市聚合，`/albums` 数据来自 `Album` 模型，两套路由、两套 API、两套 UI，共享同一个"相册解锁 token"。
2. **硬编码严重**：相册范围 23 个文件中存在 **55 个唯一 hex 色值 + 28 个唯一 rgba() 色值**，且同时存在两套金色（`#dfa87a` / `#f2b123`）与一套蓝紫选中态（`rgba(120,140,255,…)`）。
3. **像素字体误用**：`font-zpix` 共 8 处，集中在 `app/album/page.tsx`（6 处），部分用于按钮/说明文字，违背"像素只做符号"。
4. **小字号与低对比度集中在相册沉浸组件**：`PixelPhotoChat`、`PhotoChatView`、`SpaceAlbumHUD`、`SpaceUnlockModal` 是重灾区。
5. **四套风格中"notes 紫霓虹"已是死代码**：`globals.css` 仍保留 `notes-bg/neon-card/gradient-text` 定义，但 `app/components` 中已无任何引用（学习笔记模块已删除）。活跃风格实际是 3 套：travel 暖色、rose 粉色、相册暗色玻璃。
6. **截图存档暂被阻塞**：本地 dev server 存在 `PrismaMariaDB Health check failed / Reconnection failed`，除首页首次 200 外，其余路由请求超时；且 `/album`、`/albums` 需要登录态与相册解锁 token。见 §5。

---

## 1. 运行状态基线

| 项目 | 状态 |
| --- | --- |
| dev server | node 进程运行中（3 个 node 进程，启动于 2026-08-18 21:09） |
| 首页 `GET /` | 首次探测返回 `200`（819KB） |
| 其他路由 | 因 `PrismaMariaDB Health check failed` 后进入重连循环，请求 15s 超时 |
| 数据库 | dev-run.log 出现 `AuditLog_spaceId_fkey` 外键约束报错与重连失败 |

**结论**：进行视觉截图前，必须先恢复 dev server 与数据库健康；这本身是 Stage 0 的一个重要基线发现。

---

## 2. 硬编码审计

扫描范围：`app/album/**`、`components/album/**`、`app/albums/**`、`components/AlbumUnlockModal.tsx`（共 23 个文件）。

### 2.1 唯一 hex 色值（55 个）

```text
#000 #04050d #050508 #060919 #090c1e #0a0c16 #0d0604 #101018 #161B22
#1a1a1a #1B2128 #1c110d #1c1511 #1E1A1C #211713 #231611 #241E22 #2c1913
#2C343E #3A2B31 #3c2a1a #5A3A44 #5a3b30 #5A4A3A #5b8731 #70b237 #746759
#8a7662 #8a8479 #8B4A5A #8b5a2e #8B7355 #95ec69 #a02a2a #a89f91 #a8f37c
#C2AF9A #C495A0 #D4A5B0 #D8A8B2 #d8c9a6 #dfa87a #E4D6C4 #E8B8C2 #E8DDD4
#E8E6E1 #f2b123 #f3d7a0 #F5DCE0 #F5EDE4 #fce268 #FDF5ED
```

关键冲突：
- 两套金色：`#dfa87a`（像素木屋金）与 `#f2b123` / `#fce268`（Minecraft 按钮金）。
- 蓝紫选中态：`rgba(120,140,255,…)`（银河玻璃）与像素模块的琥珀金不统一。

### 2.2 唯一 rgba() 色值（28 个）

```text
rgba(0,0,0,0.15/0.4/0.5/0.6/0.65/0.7/0.8)
rgba(120,130,255,0.08) rgba(120,140,255,0.35/0.4) rgba(160,180,255,0.65)
rgba(255,220,150,0.95)
rgba(255,255,255,0/0.06/0.08/0.14/0.22/0.25/0.8/0.98)
```

### 2.3 font-zpix 使用（8 处）

| 文件 | 次数 |
| --- | --- |
| `app/album/page.tsx` | 6 |
| `components/album/PixelPhotoChat.tsx` | 1 |
| `components/album/PixelUnlockModal.tsx` | 1 |

其中 `app/album/page.tsx` 的 `font-zpix` 同时用于按钮、标题、说明文字，需在 Stage 1 收敛为"仅日期/DAY/城市/标签"。

### 2.4 小字号 `text-[8..11px]`（相册范围重点文件）

| 文件 | 典型问题 |
| --- | --- |
| `components/album/PixelPhotoChat.tsx` | ≈18 处 `text-[8-11px]`，正文/按钮/标签混用 |
| `app/album/page.tsx` | ≈16 处，书脊微信息（序号/张数/城市名） |
| `components/album/PhotoChatView.tsx` | ≈7 处 |
| `components/album/space/SpaceAlbumHUD.tsx` | 3 处（底部日期/提示） |
| `components/album/space/SpaceUnlockModal.tsx` | 3 处 |

### 2.5 低对比度 `white/30-49`（相册范围重点文件）

| 文件 | 典型问题 |
| --- | --- |
| `components/album/PhotoChatView.tsx` | 6 处 |
| `components/album/space/SpaceAlbumHUD.tsx` | 2 处 |
| `components/album/space/SpaceUnlockModal.tsx` | 3 处 |
| `components/album/space/SpaceRadar.tsx` | 1 处 |
| `components/album/space/GalaxyAlbumScene.tsx` | 3 处 |
| `components/album/AlbumLightbox.tsx` | 3 处 |
| `components/album/PhotoRiver.tsx` | 1 处 |

---

## 3. 双相册梳理

| 维度 | `/album`（沉浸式相册） | `/albums`（传统相册） | `/admin/albums`（后台管理） |
| --- | --- | --- | --- |
| 前台入口 | 导航/底部 Tab 指向 | 无导航入口（遗留路由） | 仅后台侧栏 |
| 数据来源 | `Post` 图片按城市聚合（`getPostsHybrid('travel')`） | `Album` / `AlbumMedia` 模型 | `Album` / `AlbumMedia` 模型 |
| API | `GET /api/album` | `GET /api/albums`、`GET /api/albums/:id` | `GET/POST /api/admin/albums` 等 |
| 授权 | `verifyAlbumToken`（相册解锁 cookie） | `verifyAlbumToken`（同一 token） | admin 登录态 |
| UI | 银河 Three.js 唱片 + 像素书架/拍立得 | rose 粉卡片网格 + 简单 Lightbox | 后台表格/表单 |
| 关系 | 城市相册是"派生视图" | 是"可管理的实体" | 管理端 |

**核心矛盾**：用户在前台 `/album` 看到的"城市相册"是 Post 聚合出来的，而后台管的是 `/albums` 的 `Album` 实体。两者没有打通，导致"后台建了相册，前台沉浸相册看不到"。

**Stage 1.3（双相册合并）的决策**：
- 前台唯一入口 = `/album`
- `/albums` 转为后台专属或 301 重定向到 `/album`
- 打通"城市相册(Post 聚合)"与 `Album` 实体：一个相册 = 一次旅行 / 一座城市
- 后台 `/admin/albums` 管理的内容必须能在 `/album` 呈现

---

## 4. 四套风格清单（修正版）

| 风格 | 状态 | 活跃页面/组件 | 处理 |
| --- | --- | --- | --- |
| travel 暖色（cream/ink/sakura/bloom） | ✅ 活跃 | 首页、旅行、时间线、登录、后台（暖调改版）、china-map、travel-info | 保留为主皮肤 |
| rose 粉色（rose-50/rose-500） | ✅ 活跃（应迁移） | `/albums`、`/moments`、`/search`、`LikeButton`、部分 admin 遗留 | 迁移到 travel 语义色 |
| 相册暗色玻璃（space-glass + 像素） | ✅ 活跃 | `/album` 及 `components/album/**` | 保留为沉浸皮肤，建 `--album-*` token |
| notes 紫霓虹（notes-bg/neon-card/gradient-text） | ❌ 死代码 | 无组件引用（`app/components` 扫描 0 hits），仅 `globals.css` 残留定义 | Stage 1 清理或保留隔离 |

补充发现：
- `app/life`、`app/tech` 是空目录（无文件），不参与本次审计。
- `globals.css` 约 40KB，包含大量历史样式（notes 霓虹、mermaid、glass-card 等），需要 Stage 1 做"存量清理 / 隔离"决策。

---

## 5. 截图存档（阻塞项 + 待办）

### 5.1 阻塞原因

1. dev server 数据库健康检查失败，除首页外路由超时。
2. `/album`、`/albums` 需要登录态 + 相册解锁 token（无自动化凭据）。
3. 项目未安装 Playwright / Puppeteer。

### 5.2 待采集清单（恢复后执行）

| 页面 | 桌面 | 移动 | 明 | 暗 |
| --- | --- | --- | --- | --- |
| `/` 首页 | ☐ | ☐ | ☐ | ☐ |
| `/travel` | ☐ | ☐ | ☐ | ☐ |
| `/timeline` | ☐ | ☐ | ☐ | ☐ |
| `/album`（space 模式） | ☐ | ☐ | - | ☐ |
| `/album`（pixel 模式） | ☐ | ☐ | - | ☐ |
| `/albums` | ☐ | ☐ | ☐ | ☐ |
| `/moments` | ☐ | ☐ | ☐ | ☐ |

### 5.3 建议的采集方式

- 恢复 dev server：先解决 `PrismaMariaDB` 重连与 `AuditLog_spaceId_fkey` 外键报错。
- 安装 `playwright`（开发依赖）或使用浏览器扩展录制。
- 相册页面需先手动登录并解锁相册，再导出 cookie 给自动化脚本。

> 本报告不把截图视为 Stage 0 的阻塞项：静态审计已经足以支撑 Stage 1 开工。截图可在 Stage 1 过程中补采，用于回归对比。

---

## 6. 可执行 TODO（直接进入 Stage 1）

| # | 任务 | 依据 | 优先级 |
| --- | --- | --- | --- |
| 1 | `globals.css` 增加 `--album-*` token 组（背景/文字/强调/语义态） | §2.1 55 个 hex、§2.2 28 个 rgba | P0 |
| 2 | 统一金色：`#dfa87a`/`#f2b123` → `--album-accent` | §2.1 两套金色冲突 | P0 |
| 3 | 蓝紫选中态收敛到单一语义点（唱片选中） | §2.1 | P0 |
| 4 | 替换 `app/album`、`components/album/**` 硬编码色值为 token | §2.1/2.2 | P0 |
| 5 | `font-zpix` 仅保留 日期/DAY/城市/标签，移除按钮/说明文字用法 | §2.3 | P0 |
| 6 | 小字号 `text-[8..11px]` 上调至 ≥12px（正文/按钮），符号除外 | §2.4 | P1 |
| 7 | `white/30-49` 低对比度文字上调一级或加内容层 | §2.5 | P1 |
| 8 | 双相册合并：前台唯一入口 `/album`，打通 Post 聚合与 Album 实体 | §3 | P0 |
| 9 | rose 系页面迁移到 travel 语义色 | §4 | P1 |
| 10 | 清理/隔离 `globals.css` 死代码（notes 霓虹等） | §4 | P1 |
| 11 | 恢复 dev server + 补采截图存档 | §5 | P1 |

---

## 7. 本报告产出物

- 本文件：`docs/design/Stage-0_基线审计.md`
- Stage 0 目录已建立：`docs/design/`
- 大版本方案与相册 V3 方案已在 `docs/` 下（作为后续执行依据）
