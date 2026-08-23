# Stage D 实施方案：双人协作 + 社交离线（3.1 迭代）

> 状态：**待用户确认**（确认前不动代码）
> 前置：B 阶段（移动端离线处理）+ C 阶段（发布冲刺 v3.0.0）已全部完成并部署
> 定位：补齐移动端「双人协作」核心体验 + 完成 D-4 后置的社交离线 + 性能遗留优化

---

## 〇、D 阶段总览

| 任务 | 内容 | 优先级 | 依赖 |
| --- | --- | --- | --- |
| D1 移动端空间协作 | 空间创建/加入/邀请码/成员/角色 下沉到 App | ★★★ 高 | 空间 API 已就绪 |
| D2 社交离线读写 | 旅行圈离线读 + 互动离线写（D-4 后置项） | ★★☆ 中 | 社交表建表 + pull/队列扩展 |
| D3 性能遗留优化 | Fonts 本地化 / target-size / sourcemap / LCP | ★★☆ 中 | 无 |
| D4 备案后在线验证 | 域名恢复 + App 在线全链路 + SW 激活 + C3 回归回填 | ★★★ 高 | 备案通过（外部） |
| （可选）通知推送 | App 内未读通知角标/推送 | ☆☆☆ 低 | 决策点 |

---

## D1 移动端空间协作（双人协作核心，★★★）

### 现状缺口
- 双人协作是产品核心（情侣两人共同记录），但空间管理（创建/加入/邀请码/成员/角色）**只在 Web 后台 /admin/spaces**；
- 移动端静态壳剔除 app/admin（D-3 决策），**App 内无法创建空间、无法邀请对方、无法查看成员**——伴侣无法用 App 加入同一空间，共同旅行/留言/相册能力落空。

### 内容
1. **/me 新增「我们的空间」入口**（能力门控 canManageSpace / 未加入显示引导）：
   - 无空间：创建空间（名称/简介）或输入邀请码加入；
   - 有空间：成员列表（头像/昵称/角色）、邀请码生成/复制/撤销、移除成员（OWNER）、退出空间。
2. **组件**：components/space/（SpaceEntry / SpaceManagePanel / InviteCodeBox / MemberList），复用 night/social 主题。
3. **API 复用**：GET /api/spaces、POST /api/spaces（创建）、POST /api/spaces/join（邀请码加入）、GET /api/spaces/[id]/members、POST/DELETE /api/spaces/[id]/invites、DELETE /api/spaces/[id]/members/[username]（均已有，仅核对角色校验）。
4. **Web 端**：/admin/spaces 保留（桌面仍用）。

### 验证
- App 端：无空间 → 创建 → 生成邀请码 → 第二台设备输码加入 → 双方可见同一空间成员/统计；
- VIEWER 无「管理空间」能力（入口隐藏，服务端 403 复检）。

---

## D2 社交离线读写（D-4 后置项，★★☆）

### 现状缺口
- D-4 决策「社交后置」；v3.0.0 后社交仍完全在线（Feed/详情/互动），断网时旅行圈不可用；
- 本地 schema 未建社交表（comment/like/favorite 按 D-4 未建表）。

### 内容
1. **本地社交表**（schema.ts 追加，v2 迁移幂等）：
   - `social_post`（旅行圈帖子缓存：id/travelId或postId/title/cover/authorId/likes/comments 计数/updatedAt）
   - `interaction`（我的点赞/收藏/评论草稿：entityType/entityId/action/updatedAt）
2. **离线读**：/circle Feed 与详情 readWithFallback（在线 /api/social/posts，离线回退本地 social_post；首屏数据由 SyncEngine pull 预填充）。
3. **互动离线写**（SyncQueue 扩展）：点赞/收藏/评论入队（entityType LIKE/COMMENT/FAVORITE 已有枚举），联网自动上传；dispatcher 映射对应 API。
4. **UI**：SocialBar / CommentPanel 乐观更新接入离线队列（离线点赞显示 ↑，联网同步）。

### 验证
- 断网浏览已缓存的旅行圈 Feed/详情；离线点赞/评论 → 联网自动同步且不重复；
- Web 端社交不回归。

---

## D3 性能遗留优化（C4 待办执行，★★☆）

### 内容
1. **Google Fonts 本地化**：字体文件下载到 public/fonts 自托管（消除第三方阻塞，LCP 提升）；或改为 `display=swap` + 预连接优化。
2. **target-size**：交互按钮最小 44×44（相册/社交小图标按钮，Lighthouse A95→目标 ≥96）。
3. **sourcemap 策略**：生产构建不输出 sourcemap（或保留本地）。
4. **LCP 优化**：首屏图片 next/image 尺寸/优先级核对、JS 按需动态导入复查。

### 验证
- Lighthouse 复测：P ≥ 70、A ≥ 96（对照 C4 基线 P62/A95）；
- 页面无功能回归。

---

## D4 备案后在线验证（★★★，外部依赖）

### 内容（备案通过后执行）
1. 验证 `travel-notes.yuanabd.cn` 恢复（302 webblock 消失）→ login 200、HSTS 头正常。
2. App 在线全链路：登录（域名 API 基址）→ 同步（SyncEngine pull 云端 → 本地）→ OTA 版本检查（/api/version 3.0.0）。
3. PWA SW 激活确认：注册成功、断网开首页缓存生效。
4. **C3 真机回归回填**：Android 安装 v3.0.0 APK，按 Stage-C3 清单逐项执行并回填结果。

### 交付
- Stage-C3 清单全绿 + 验证记录追加改动记录.md。

---

## 决策点（需用户拍板）

| # | 决策 | 选项 | 建议 |
| --- | --- | --- | --- |
| D-D1 | D1 空间协作是否纳入 | A. 纳入（推荐，双人协作核心） B. 延后 | A |
| D-D2 | D2 社交离线范围 | A. 只读（Feed 缓存） B. 读写（含点赞/评论离线写，推荐） | B |
| D-D3 | D3 性能优化是否纳入 | A. 纳入（推荐，与 D1/D2 并行） B. 仅记录基线 | A |
| D-D4 | App 通知推送 | A. 暂不（推荐，价值低） B. 纳入 | A |

## 执行批次（确认后）

| 批次 | 任务 | 提交粒度 |
| --- | --- | --- |
| D1a | 空间 API 角色核对 + /me 入口 + 创建/加入 | 独立 commit |
| D1b | 邀请码/成员管理面板 | 独立 commit |
| D2a | 社交表建表 + pull 预填充 | 独立 commit |
| D2b | Feed/详情离线读 + 互动离线写 + UI | 独立 commit |
| D3 | 性能/无障碍遗留修复 | 独立 commit |
| D4 | 备案后在线验证 + C3 回归回填 | 独立 commit（外部触发） |

每批：`npx tsc --noEmit` → git 提交推送 → 服务器部署 → 冒烟。
