# Stage 1 视觉统一 · 进展记录

> 日期：2026-08-18  
> 状态：进行中（已完成 Token 基础 + 相册主路径硬编码/字号/对比度第一轮替换）  
> 类型检查：`npx tsc --noEmit` ✅ 通过

---

## 一、本轮已完成

### 1.1 Design Token 基础

- `tailwind.config.js` 新增两组调色板：
  - `album.*`：暗色相册视觉系统（bg0/bg1/bg2/surface/text1-3/warm/accent/accentStrong/accentDim/ok/sync/wait/error）
  - `pixel.*`：像素木屋/纸面肤色（ink/muted/faint/line/photo/panel/panel2/panel3/paper/online/bubble/lineLight/error/goldLight/goldPale）
- `app/globals.css` 同步新增 `--album-*` 与 `--album-pixel-*` CSS 变量。
- `space-twinkle` 星点闪烁强度降低：`opacity 0.15→0.9` 改为 `0.15→0.5`，`scale` 收窄。

### 1.2 硬编码颜色替换为 token

已替换文件：

| 文件 | 处理 |
| --- | --- |
| `app/album/page.tsx` | 背景/强调/文字/木屋结构色全部 token 化，0 个剩余 hex |
| `components/album/PolaroidWall.tsx` | 强调/文字/纸面肤色 token 化 |
| `components/album/PixelUnlockModal.tsx` | 强调/文字/错误态 token 化 |
| `components/album/PixelPhotoChat.tsx` | 背景/强调/文字/纸面/在线态/聊天气泡 token 化（仅剩 `shadow` 中 `#000`） |
| `components/album/PhotoChatView.tsx` | 背景/文字/强调/聊天气泡 token 化 |
| `components/album/space/GalaxyAlbumScene.tsx` | 背景/强调/文字 token 化 |
| `components/album/space/SpaceAlbumHUD.tsx` | 文字层级 token 化 |
| `components/album/space/SpaceUnlockModal.tsx` | 背景/强调/文字/错误态 token 化 |
| `components/album/space/SpaceRadar.tsx` | 雷达选中态改为强调金，移除蓝紫非选中态 |

### 1.3 强调色统一

- `#dfa87a` / `#f2b123` / `#fce268` → `album.accent` / `album.accentStrong` / `pixel.goldLight`
- 蓝紫 `rgba(120,140,255,…)` 从银河解锁光晕、雷达非选中态中移除，仅保留渲染引擎内部数值（见 §二）。

### 1.4 font-zpix 收敛

- 移除 loading 状态正文中的 `font-zpix`。
- 保留像素标题（相册名、书架标题、城市标题）——作为记忆符号/标题皮肤使用。

### 1.5 小字号与低对比度

- 按钮与正文/说明文字 `text-[9|10|11px]` → `text-xs`（≥12px）。
- 保留符号类小字：书脊序号、竖排城市名、张数、蜡封"记"、雷达"360°"、页码。
- `white/30-49` 低对比度文字主要上调至 `album.text2`（0.68）。

---

## 二、有意保留的硬编码（非本轮 token 范畴）

| 位置 | 原因 |
| --- | --- |
| `components/album/space/particlePhoto.ts` | WebGL 着色器/粒子引擎内部颜色数值 |
| `components/album/space/ParticlePhotoBackground.tsx` | 粒子引擎配置 |
| `components/album/StarfieldBackground.tsx` | 星空引擎颜色常量 |
| `components/album/space/SpaceRadar.tsx` 的 SVG `fill` | SVG presentation attribute 无法用 Tailwind class，已用固定强调金 |
| `components/album/PixelPhotoChat.tsx` 的 `#000` 像素阴影 | 像素风的纯黑描边 |

> 这些是渲染引擎内部数值，不是 UI 设计 token，后续如需统一再单独处理。

---

## 三、待办（Stage 1 剩余项）

| # | 待办 | 归属 | 优先级 |
| --- | --- | --- | --- |
| 1 | `/albums`、`/moments`、`/search`、`LikeButton` 等 rose 系页面迁移到 travel 语义色 | Stage 1.1 | P1 |
| 2 | `components/AlbumUnlockModal.tsx`（登录页相册解锁弹窗）硬编码色 token 化 | Stage 1.1 | P1 |
| 3 | `globals.css` 存量死代码（notes 霓虹等）清理/隔离 | Stage 1.1 | P1 |
| 4 | 双相册合并（前台唯一入口 `/album`，打通 Post 聚合与 Album 实体） | Stage 1.3 | P0 |
| 5 | 截图存档（需先恢复 dev server + DB 健康 + 登录态） | Stage 0 补采 | P1 |
| 6 | 组件化（AlbumPhoto/PhotoViewer/AlbumDayDivider/GalaxyBackground/PixelBadge/TravelFilmCard） | Stage 1.2 | P0 |

---

## 四、验证

- `npx tsc --noEmit` ✅ 通过（无错误输出）。
- 暂未跑 `next build`（需要健康 DB，且 Stage 1.1 未到构建验收节点）。

## 五、下一步建议

1. 完成 §三 P1 的 rose 迁移与 `AlbumUnlockModal` 清理，让全站只剩 travel 暖色 + 相册暗色两套皮肤。
2. 开始 Stage 1.2 组件化（优先 `TravelFilmCard`，它是 Stage 2 旅行圈的原料）。
3. Stage 1.3 双相册合并前，先恢复 dev server 并做一次截图回归。
