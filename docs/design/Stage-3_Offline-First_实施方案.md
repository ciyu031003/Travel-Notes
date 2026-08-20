# Stage 3：Offline First（离线优先）实施方案

> 版本：V1 · 2026-08-20
> 所属：Travel-Notes 3.0「银河记忆」大版本 · Stage 3 Offline First
> 里程碑：M3 · 3.0-rc
> 前置：Stage 0（基线）/ Stage 1（相册视觉）/ Stage 2（旅行圈社交）已完成；Stage 1.5（移动端本地媒体管线）此前未落地，本阶段一并补齐。

---

## 一、本阶段定位与结论

把「甜途」从“必须联网的网页壳”升级为“离线可用、联网自动同步”的移动端产品。

现状（代码核对）：
- Capacitor Android 已接入，但当前只是 web shell：`capacitor.config.ts` 里 `server.url = 'http://106.55.2.197'`，App 每次打开都从服务器拉页面，断网即白屏。
- 无本地数据库 / 本地文件缓存 / SyncQueue / 同步状态 UI（全仓无 sqlite / filesystem / network 插件，无 syncStatus）。
- 照片是离线价值最大的数据（几百张原图），因此移动端相册先做本地媒体管线。

结论（先 Schema 后页面，大版本方案 §11 R5）：
1. 先装 Capacitor 原生插件（SQLite / Filesystem / Network）。
2. 再设计本地 SQLite Schema + SyncQueue（数据地基）。
3. 再实现媒体本地管线 + 离线读 + 写队列 + 自动同步。
4. 最后做同步状态 UI（照片角标 + 同步中心 + 设置页）。

---

## 二、技术选型与依赖

| 能力 | 选型 | 说明 |
| --- | --- | --- |
| 本地库 | @capacitor-community/sqlite | 只存结构化数据，不存图片二进制 |
| 本地文件 | @capacitor/filesystem | 原图/缩略图/视频写 App 私有目录 |
| 网络检测 | @capacitor/network | networkStatusChange 驱动自动同步 |
| 离线壳（可选） | 服务端资产打包 / SW | 见风险 R-1 |

> 平台降级：这些是原生插件，浏览器端用不到。代码统一走「平台探测 + 降级」——浏览器继续走网络 API，原生端才走本地库/文件系统。

---

## 三、本地数据模型（SQLite）

### 3.1 表清单（结构化快照，只存可离线浏览的最小字段集）

| 表 | 说明 | 离线读写 |
| --- | --- | --- |
| Travel | 旅行 | 读 + 写（新增旅行） |
| TravelDay | 旅行天 | 读 + 写 |
| Memory | 回忆 / 留言 | 读 + 写 |
| Media | 媒体元数据 | 读 + 写（上传照片） |
| Album / AlbumMedia | 相册 | 读 |
| Moment | 碎碎念 | 读 + 写 |
| Comment / Like / Favorite | 社交互动 | 写（操作日志合并） |
| SyncQueue | 同步队列 | 内部 |
| Meta | 版本 / 游标 | 内部 |

### 3.2 通用列

- `remoteId`：云端主键；本地新建为 NULL，同步成功后回填。
- `updatedAt`：LWW 冲突依据（毫秒时间戳）。
- `syncStatus`：SYNCED / PENDING_UPLOAD / PENDING_DOWNLOAD / ERROR。
- `deleted`：软删标记（墓碑 tombstone），同步时转成 DELETE 下发。

### 3.3 Media 元数据（离线价值核心）

```text
id / remoteId / travelId / memoryId / type / mimeType / size / width / height
/ localPath（Capacitor 文件路径）/ remoteUrl（云端 URL）/ sha256
/ syncStatus / takenAt / createdAt / updatedAt
```

---

## 四、SyncQueue 同步队列

```text
entityType / entityId / operation（CREATE|UPDATE|DELETE|UPLOAD_MEDIA）
/ payload（JSON 快照）/ retryCount / status（PENDING|SYNCING|FAILED）
/ lastError / createdAt / updatedAt
```

写流程：本地写 → UI 立即更新（乐观）→ 入队 → 网络可用逐条上传 → 失败指数退避重试。

---

## 五、网络检测与自动同步

- 监听 @capacitor/network 的 networkStatusChange。
- 触发时机：App 启动 / 恢复前台 / online 事件 / document visibilitychange。
- 顺序：先推本地改动（upload 优先），再拉远端增量（download）。

---

## 六、冲突策略

- 普通字段：LWW（updatedAt 最大胜出）。
- 媒体：sha256 + remoteId 去重，重复不重传、不重复占存储。
- 互动（评论/点赞/收藏）：操作日志合并（按 op 顺序 apply），不简单覆盖。

---

## 七、同步状态 UI（沿用 Stage 1 像素符号语言）

- 照片右下角 1 个像素符号：✓ 已同步 / ↑ 待上传 / ☁ 仅云端 / ! 失败 / ⚠ 冲突。
- 「我的旅行档案」或设置页新增「数据与同步」入口 + 独立同步中心（已同步 / 上传中 / 等待 / 失败 + 一键重试）。
- AlbumPhoto 已预留角标位，直接落地符号渲染（图标 + 颜色双通道）。

---

## 八、子阶段拆解与交付

| 子阶段 | 内容 | 交付 |
| --- | --- | --- |
| 3.1 插件接入 | 装 sqlite/filesystem/network；平台降级封装 | lib/modules/offline/native/*.ts |
| 3.2 本地 Schema + SyncQueue | 建表 + DAO + 队列 | lib/modules/offline/db.ts / sync-queue.ts |
| 3.3 离线读 + 媒体管线 | 相册/旅行/照片本地缓存；缩略图/展示图/原图三级 | lib/modules/offline/media.ts |
| 3.4 写队列 + 自动同步 + 冲突 | 离线写 + 队列 + 网络触发 + LWW/去重 | lib/modules/offline/sync-engine.ts |
| 3.5 同步状态 UI | 角标 + 同步中心 + 设置入口 | components/offline/* / app/sync/* |

---

## 九、验收标准（M3）

- [ ] 飞行模式下可浏览本地相册/照片/留言并新增记录；联网后 SyncQueue 自动上传
- [ ] 同步中心准确显示各项数量与状态；失败项可一键重试
- [ ] 重复同步不产生重复数据（sha256 去重 + 幂等）
- [ ] 断网重连后无数据丢失或重复

---

## 十、风险与应对

| 风险 | 应对 |
| --- | --- |
| R-1 离线壳：远程 URL 断网连页面壳都加载不出来 | 分两步：先做「数据离线」（本阶段主体，联网打开后离线可用）；再评估 PWA/本地资产打包做「壳离线」（独立子阶段 3.6） |
| R-2 浏览器端与原生端两套数据通路 | 统一 Repository 接口：浏览器走 fetch、原生走 SQLite，页面层无感 |
| R-3 同步越权 / IDOR | 上传时服务端复检 canRead/canWrite；SyncQueue 只回填自己名下的 remoteId |
| R-4 幂等 | 服务端写接口全部幂等（复用 Stage 2 唯一约束 + upsert），重复投递不重复落库 |
| R-5 复杂度过高 | 先只做「相册离线读 + 照片/留言/碎碎念离线写」最小闭环，其余实体后续扩展 |

---

## 十一、目录规划

```text
lib/modules/offline/
  native/        # Capacitor 插件封装 + 平台降级
  db.ts          # SQLite 连接 + 建表
  dao/           # 各实体本地读写
  sync-queue.ts  # 队列入队/出队/重试
  sync-engine.ts # 自动同步调度 + 冲突策略
  media.ts       # 媒体本地管线（三级 + sha256）
components/offline/  # 角标 / 同步中心
app/sync/            # 同步中心页面
```

---

## 十二、下一步

1. 3.1：装 Capacitor 插件 + 平台降级封装（本阶段落地第一步）。
2. 3.2：本地 Schema + SyncQueue（先 Schema 后页面）。