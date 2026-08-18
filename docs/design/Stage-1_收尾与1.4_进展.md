# Stage 1.1 收尾 + 1.4 旅行档案进展

> 日期：2026-08-18

## 一、1.1 收尾已完成

1. **rose → travel 语义色迁移**：全站 `app/` + `components/` 内 `rose-*` 引用清零。
2. **新增 travel 语义色 token**：`accent/accentStrong/accentSoft` + 暖中性 `sand/sandSoft/sandLight/parchment/parchmentDim/inkStrong/line`（tailwind + CSS vars）。
3. **`components/AlbumUnlockModal.tsx` token 化**：品牌/强调/浅色暖调已替换为 travel token；暗色中性色（`#1B2128` 等）作为项目统一暗色惯例保留。
4. **notes 死代码隔离**：`globals.css` 两段 notes 紫霓虹样式已标记 `DEPRECATED`，仅隔离待清理。
5. **验证**：
   - `npx tsc --noEmit` ✅
   - `npx next build` ✅（55 页生成成功）

## 二、截图回归状态：已准备、待执行

- 新增脚本：`scripts/stage0-screenshots.mjs`（Playwright）
- 新增清单：`docs/design/Stage-1_截图回归清单.md`
- 阻塞项：dev server DB 健康检查超时 + 登录/相册解锁凭据 + 未安装 Playwright

## 三、1.4 旅行档案（已启动）

已新增组件并接入 `/album` 像素模式：

| 组件 | 说明 |
| --- | --- |
| `TravelLocationBadge` | 地点标签（MapPin + 像素标签） |
| `TravelTimeline` | 像素节点时间线 |
| `TravelFilmCard`（1.2 已有） | 档案封面 / 旅行圈卡片复用 |
| `AlbumDayDivider`（1.2 已有） | DAY 分隔符，待档案 DAY 分段时启用 |

`/album` 像素模式已增加「旅行档案」信息区：地点标签 + 日期 + 照片数 + 单节点时间线，替代原纯文字头部，作为 1.4 第一步落地。

### 1.4 剩余
- [ ] Travel Film 档案视图（封面 = TravelFilmCard hero）
- [ ] Day 标记与照片分组（需 Travel/TravelDay 数据打通）
- [ ] 旅行星图（地图城市连线）
- [ ] Space 共同星图（我们一起去过 N 城/N 国/N 天/N 张）

---

## 四、验证记录

- `npx tsc --noEmit` ✅
- `npx next build` ✅（1.1 收尾后）
- `npx next lint`：全仓仅有存量 warning（未使用变量 / any / exhaustive-deps），无新增 error。
