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

- [ ] Performance 提升：Google Fonts 本地化/预加载优化；大组件动态导入（星图/PhotoRiver 已按需，可查首屏 JS 体积）。
- [ ] target-size：交互按钮最小 44×44（相册小图标按钮）。
- [ ] valid-source-maps：构建产物不产出 sourcemap（或本地保留）。
- [ ] 真机回归（C3 清单）执行后回填。
