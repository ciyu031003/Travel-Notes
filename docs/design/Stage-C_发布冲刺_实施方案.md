# Stage C 实施方案：发布冲刺（3.0 正式版收尾）

> 状态：**待用户确认**（确认前不动代码）
> 前置：B1-B5 移动端离线处理已全部完成并部署（v2.6.1，HEAD bd0d4ff）
> 目标：补全 D-4 首期离线写范围（照片）、云端存储优化、移动端验收、性能/无障碍验收、3.0 正式版发布

---

## 〇、C 阶段总览

| 任务 | 内容 | 对应里程碑 | 依赖 |
| --- | --- | --- | --- |
| C1 照片离线上传 | UPLOAD_MEDIA 媒体管线接线（D-4 唯一缺口） | M3 · Offline First 补全 | 新增 @capacitor/camera 插件 |
| C2 云端存储优化 | 三级缩略 + 上传压缩 + 存储后端 | M3.5 · Stage 4 | 决策点：是否引入云存储 |
| C3 移动端验收 | 真机离线/弱网回归 + 权限回归 | M3 · 3.7 验收 | C1 完成后 |
| C4 性能/无障碍验收 | Lighthouse + 无障碍修复 + 性能优化 | M4 · Stage 5 | 无 |
| C5 3.0 正式版发布 | 版本 bump + AAB 上架包 + tag | M4 · 3.0 正式版 | 备案通过（外部） |
| （可选）社交离线 | 旅行圈离线读/写 | D-4 后置项 | 决策点：是否纳入 |

---

## C1 照片离线上传（D-4 首期离线写范围补全）

### 现状缺口
- D-4 决策：首期离线写 = **照片/留言/碎碎念/旅行**。
- B 阶段已落地：旅行（travel-write）、相册实体（album-write）、留言（memory-write）、碎碎念（moment-write）。
- **照片（媒体）离线上传未接线**：sync-dispatcher 对 `UPLOAD_MEDIA` 直接抛错（「媒体上传走媒体管线，不由通用分发器处理」），且 media 管线只有「下载缓存」（3.3 cacheRemoteMedia），没有「本地选图 → 上传」方向。

### 内容
1. **移动端选图/拍照**：新增 `@capacitor/camera` 插件（拍照 + 系统相册选图），原生端入口；Web 端回退 `<input type=file>`。
2. **本地落盘**：`lib/modules/offline/media-upload.ts` —— 选图 → 压缩/缩略（Canvas，≤320 缩略 + 原图）→ 写本地文件（media/ 目录）→ media 表 INSERT（syncStatus=PENDING_UPLOAD）→ SyncQueue 入队 `UPLOAD_MEDIA`。
3. **上传分发**：sync-dispatcher 增加 `UPLOAD_MEDIA` 分支 → multipart/form-data 上传到 `POST /api/admin/albums/[id]/media`（或独立媒体接口）→ 成功后回写 media 表 SYNCED + remoteId。
4. **UI 接线**：相册详情/相册卡「添加照片」入口（原生端显示，复用 AlbumComposer 弹窗模式）；照片上传中/待传状态显示 SyncBadge（3.5 已有）。
5. **服务端**：确认/补齐 `POST /api/admin/albums/[id]/media` 支持 multipart 接收（当前是 FormData？需核对，若缺失则新增）。

### 验证
- 真机断网选图 → 本地出现照片 + ↑ 角标 → 联网自动上传 → 云端相册可见照片 → ✓ 角标。
- sha256 去重：重复选同一张图不产生重复上传。

---

## C2 云端存储优化（M3.5 · Stage 4）

### 内容
1. **三级缩略**（方案原述：≤320 缩略图/展示图/原图）：
   - 服务端已有 `generateMediaVariants`（缩略/预览/模糊占位，见 album.service.ts addMediaToAlbum）；
   - 补移动端上传侧客户端缩放（Canvas 生成 ≤320 缩略，减少上行流量）。
2. **上传压缩**：图片统一转 WebP（sharp 已有），限制单张 ≤5MB。
3. **存储后端**（决策点）：保持本地磁盘（现状）vs 接入对象存储（腾讯云 COS / S3 兼容）。
   - 本地磁盘：零成本、无额外配置；扩容靠服务器磁盘。
   - COS：图片走 CDN 提速、备份安全；需配置密钥 + 存储抽象改造（storage service 已抽象，改动可控）。
4. **相册加载优化**：列表用缩略图、详情用展示图、查看原图按需。

### 验证
- 上传一张大图 → 云端自动生成三级变体 → 相册列表/详情/原图各取所需，加载时间下降。
- 移动端上传流量统计下降（缩略先行）。

---

## C3 移动端验收（M3 · 3.7 验收）

### 内容
按 Stage-3 方案「九、验收标准（M3 修订）」逐项核对，产出验收清单文档：
- [ ] 断网可打开 App 首页并浏览本地相册/照片/旅行/留言（壳离线 + 数据离线）
- [ ] 离线可新增照片/留言/碎碎念/旅行；联网后 SyncQueue 自动上传且不重复（sha256 去重 + 幂等）
- [ ] 同步中心准确显示数量/状态；失败项可一键重试
- [ ] 移动端无 /admin；模块内管理入口按 OWNER/MEMBER/VIEWER 正确显隐与鉴权
- [ ] 断网重连后无数据丢失或重复
- [ ] Web 端功能不回归

### 方式
- 真机（Android）离线/弱网（飞行模式 / 弱网工具）回归清单化；
- 每项记录 通过/失败 + 截图；
- 权限回归复用 B5 的三档账号法（一次性脚本，测完清理）。

---

## C4 性能/无障碍验收（M4 · Stage 5）

### 内容
1. **Lighthouse 审计**（桌面 + 移动）：Performance / Accessibility / Best Practices / SEO 四维，记录基线。
2. **无障碍修复**（重点：相册沉浸组件、旅行圈）：
   - 对比度（低对比度 white/30-49 残留排查）；
   - 键盘导航 / focus 可见性（PhotoViewer、星图、Gallery）；
   - aria-label / role 补齐（Canvas 星图已有部分）。
3. **性能优化**：
   - 图片尺寸与懒加载核对（next/image 已用，检查 sizes）；
   - JS 首屏体积（按需动态导入大组件）；
   - PWA SW 缓存策略完善（静态资源预缓存清单）。

### 验证
- Lighthouse 各维度 ≥ 目标分（如 P≥80、A≥90）或记录基线后改善；
- 无障碍专项清单逐项通过。

---

## C5 3.0 正式版发布（M4）

### 内容
1. **版本 bump**：2.6.1 → 3.0.0（package.json / lib/app-version.ts / android build.gradle versionCode 4）。
2. **AAB 上架包**：`gradlew.bat bundleRelease`（Play 商店/国内商店要求 AAB 或 APK），产物 app-release.aab。
3. **发布文档**：改动记录.md 追加 3.0 正式版会话快照 + tag `v3.0.0`。
4. **备案后验证（外部依赖）**：备案通过 → travel-notes.yuanabd.cn 恢复 → App 在线登录/同步全链路 → PWA SW 激活确认。

---

## （可选）社交离线（D-4 后置项）

- 内容：旅行圈 Feed 离线读（社交表 comment/like/favorite 建表 + pull）+ 点赞/收藏/评论离线写（LIKE/COMMENT/FAVORITE 队列）。
- 说明：D-4 明确「社交后置」；单人/情侣使用场景下社交（公开旅行圈）离线价值中等，**建议延后或砍掉**，优先 C1-C5。
- 决策点：是否纳入本阶段。

---

## 决策点（需用户拍板）

| # | 决策 | 选项 | 建议 |
| --- | --- | --- | --- |
| D-C1 | 照片选图方式 | A. 新增 @capacitor/camera（拍照+相册） B. 仅相册选图（filesystem 已有） | A（体验完整） |
| D-C2 | 云端存储 | A. 保持本地磁盘 B. 接入腾讯云 COS | A（备案/成本优先，COS 后置） |
| D-C3 | 社交离线 | A. 纳入 C 阶段 B. 延后到下一阶段 | B（价值中等，先冲 3.0 正式版） |
| D-C4 | 上架渠道 | A. 仅内测 APK/AAB B. 上架应用商店 | A（先自用/内测，上架后议） |

## 执行批次（确认后）

| 批次 | 任务 | 提交粒度 |
| --- | --- | --- |
| C1a | camera 插件 + media-upload 管线 + dispatcher UPLOAD_MEDIA | 独立 commit |
| C1b | 相册添加照片 UI + 同步角标 | 独立 commit |
| C2 | 三级缩略 + 上传压缩 + 加载优化 | 独立 commit |
| C3 | 验收清单 + 回归记录 | 独立 commit |
| C4 | Lighthouse + 无障碍 + 性能修复 | 独立 commit |
| C5 | 3.0.0 bump + AAB + tag + 备案后验证 | 独立 commit |

每批：`npx tsc --noEmit` → git 提交推送 → 服务器部署 → 冒烟；C5 待备案通过后执行在线验证。
