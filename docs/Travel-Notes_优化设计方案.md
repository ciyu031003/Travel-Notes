# Travel-Notes 剩余待办（未来方向）

> 本文由原《Travel-Notes 下一阶段及未来完整优化设计方案》(1733 行) 精简而来。
> 原文档大部分已完成并落地，见改动记录：产品定位升级「个人旅行记忆空间」、去情侣化、Space/Travel/TravelDay/Itinerary/Expense/Memory/Media/Album 数据模型、P0 安全基线（升级 Next.js 15/删默认管理员/上传安全/Markdown XSS/限流/Security Headers）、RBAC 权限、AuditLog、Timeline/Album/Anniversary、UI V2/V3 品牌统一、admin 品牌统一等。
> 本文仅保留**尚未实现**的未来方向。

---

## 一、AI 能力（P3 · 后期）

> 前置：核心架构已稳定，可在需要时引入。当前未实现。

### 1.1 AI 旅行总结

输入 `Travel + Memory + Media + Location`，生成一次旅行的文字总结。

### 1.2 AI 时间线

自动发现并标记：
- 第一次去某城市
- 第一次旅行 / 出国
- 第一次看樱花等主题
- 特殊纪念日

### 1.3 AI 相册整理

基于 EXIF / 时间 / GPS / 图像内容，自动聚类整理相册。

---

## 二、测试规划（未实施）

- **Unit Test**：Service 层（travel/post/auth/space）单测，覆盖核心业务逻辑
- **Integration Test**：API 路由集成测试（登录/CRUD/权限）
- **E2E**：关键用户流程（登录 → 建旅行 → 添加行程/照片 → 查看时间线/相册）

> 当前项目仅 vitest 配置（`vitest.config.mts`），测试体系尚未系统建设。

---

## 三、其他可选项（按需，非必做）

- **对象存储**：已有 `STORAGE_*` 环境变量可选支持（配置即启用），无需代码改动
- **Redis**：多实例/CDN 场景才需要，单机内存缓存已够（见 ARCHITECTURE_OPTIMIZATION 阶段五）
- **Sentry 错误追踪**：生产可接入（`@sentry/nextjs`）

---

## 四、已完成的原文档内容（不再重复，见改动记录）

原方案中以下内容已完成，不再保留在此：
- P0：升级 Next.js、删除默认管理员、Auth/Session 加固、上传安全、Markdown XSS、Rate Limit、Security Headers ✅
- P1：删除学习笔记、删除旧 Post 架构依赖、建立 Space、Travel/Memory 数据模型、Media 独立、Object Storage 抽象、Permission/RBAC、AuditLog ✅
- P2：Timeline、Album、Anniversary、Itinerary、Expense ✅
- UI：品牌「行迹」+ 暖陶土 + 去情侣化 + 双主题 + admin 统一 ✅
