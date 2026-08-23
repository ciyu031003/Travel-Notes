# Stage C4：性能/无障碍验收记录（M4 · Stage 5）

> 审计对象：https://106.55.2.197:8443/login（生产 · 2026-08-23 · Lighthouse 13.4.1 · Chrome headless）
> 状态：基线已记录，修复项已落地（对比度 / PWA manifest / SW 预缓存）

## 一、Lighthouse 基线（登录页）

| 维度 | 分数 | 主要扣分项 |
| --- | --- | --- |
| Performance | **62** | LCP 54（字体/JS 阻塞）、TBT 16（主线程长任务）、interactive 84 |
| Accessibility | **95** | target-size 0（点击目标过小） |
| Best Practices | **92** | errors-in-console、inspector-issues、valid-source-maps |
| SEO | **100** | — |

## 二、C4 已落地修复

1. **低对比度**（相册沉浸组件）：`text-white/40 → text-white/70` × 4 处（AlbumLightbox 页码/描述/标签、PhotoRiver 空态）。
2. **PWA manifest**：新增 `public/manifest.json`（standalone + theme_color #E8B8C2 + SVG 图标）+ `public/icon.svg`；layout.tsx 接入 `<link rel=manifest>` + theme-color + favicon。
3. **SW 首屏预缓存**：`public/sw.js` install 阶段预缓存 `/` `/login` `/manifest.json`（allSettled 容错），断网冷启动更快命中。
4. 服务器验证：`/manifest.json` HTTP 200。

## 三、待办（非阻塞，下一轮优化）

- [x] ~~Performance 提升~~：**D3 已完成**（2026-08-23）——Google Fonts 本地化（自托管 latin 子集 Inter 400/500/600 + Playfair 700/900，public/fonts/），移除远程 fonts.googleapis.com 加载。
- [ ] target-size：交互按钮最小 44×44（相册小图标按钮）。
- [ ] valid-source-maps：构建产物不产出 sourcemap（或本地保留）。
- [ ] 真机回归（C3 清单）执行后回填。

## 四、D3 复测结果（2026-08-23 · 字体本地化后）

| 维度 | C4 基线 | D3 后 | 变化 |
| --- | --- | --- | --- |
| Performance | 62 | **69** | +7（消除 Google Fonts 第三方阻塞） |
| Accessibility | 95 | 95 | 持平（target-size 待办） |
| Best Practices | 92 | **100** | +8 |
| SEO | 100 | — | 未复测（无相关改动） |
