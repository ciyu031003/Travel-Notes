# Stage 1 验收记录（1.2 组件化 + 1.3 双相册合并）

> 日期：2026-08-18  
> 验收结论：**通过** ✅（TypeScript / ESLint / Next build 三项均通过）

---

## 一、验收命令结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit` | ✅ 无错误 |
| ESLint | `npx next lint ...` | ✅ No ESLint warnings or errors |
| 生产构建 | `npx next build` | ✅ 55 个静态页生成成功 |

构建路由要点：
- `/album` → 静态页 162 kB
- `/albums` → 306 B（重定向到 `/album`）
- `/albums/[id]` → 306 B（重定向到 `/album`）

---

## 二、1.2 组件化交付

在 `components/album/` 新建：

| 组件 | 作用 | 关键 API |
| --- | --- | --- |
| `AlbumPhoto.tsx` | 相册照片单元：固定宽高比 + next/image + 单角标 | `src/badge/aspect/sizes/priority/onClick` |
| `AlbumDayDivider.tsx` | DAY 分隔符（像素记忆符号） | `day/label` |
| `PhotoViewer.tsx` | 全屏照片查看器：左右切换/键盘/滑动/双击缩放/页码/EXIF | `images/index/onClose/onIndexChange` |
| `GalaxyBackground.tsx` | 低噪音银河背景（CSS 星点，透明度 ≤0.5） | `density/className` |
| `PixelBadge.tsx` | 像素小标签（日期/地点/DAY） | `children/className` |
| `TravelFilmCard.tsx` | 统一连接器：card/hero/strip 三变体，onOpen 为空时静态卡 | `coverUrl/cityName/title/dateRange/dayCount/photoCount/location/author/stats/variant/onOpen` |

说明：
- `PhotoViewer` 已实现双击缩放与滑动切换；双指捏合缩放留待移动端手势专项（代码内已注释）。
- `TravelFilmCard` 是 Stage 2 旅行圈的核心原料，已支持无 `onOpen` 的静态展示，便于先在相册归档中落地。

---

## 三、1.3 双相册合并交付

1. **前台唯一入口**：`/albums` 与 `/albums/[id]` 均重定向到 `/album`。
2. **后台数据进前台**：`/api/album` 新增返回 `albums`（Album 实体）。
3. **前台呈现**：`/album` 像素模式新增「纪念相册」区，用 `TravelFilmCard` 渲染后台 `Album` 实体。
4. **导航**：Navbar / MobileBottomNav 已只有一个相册入口 `/album`（无需改动，原本即如此）。

数据流：
```text
后台 /admin/albums → Album / AlbumMedia
                        ↓
               GET /api/album（新增 albums）
                        ↓
               /album 像素模式「纪念相册」区
```

可见性说明：`/api/album` 已在 album token 保护后，`listAlbums()` 不带 userId 时返回全部相册，符合该私有入口的语义。

---

## 四、Stage 1 剩余 P1 待办（未阻塞本轮验收）

| 待办 | 归属 |
| --- | --- |
| rose 系页面（`/moments`、`/search`、`LikeButton`、部分 admin）迁移到 travel 语义色 | Stage 1.1 收尾 |
| `components/AlbumUnlockModal.tsx` 硬编码色 token 化 | Stage 1.1 收尾 |
| `globals.css` 存量死代码（notes 霓虹等）清理/隔离 | Stage 1.1 收尾 |
| 截图存档（需先恢复 dev server + DB 健康 + 登录态） | Stage 0 补采 |

---

## 五、下一步

Stage 1.2/1.3 已验收通过，可进入：
- Stage 1.4 旅行档案（Travel Film 档案视图 / Day 标记 / 时间线 / 星图）
- 或先完成 Stage 1.1 收尾（rose 迁移 + 死代码清理 + 截图补采），再整体截图回归。
